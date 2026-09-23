import { AppError, scrubSecrets } from '@/lib/errors';
import { env } from '@/lib/env';
import { asAmount, normalizeCheckout, normalizeTicket } from './normalize';
import type { NovaCheckout, NovaTicket } from './types';

/**
 * Cliente HTTP hacia Nova Parking (el sistema existente de Edier).
 *
 * ESTA ES LA UNICA PUERTA hacia ese sistema. Ningun otro modulo debe hacer
 * fetch a Django directamente: eso permite cambiar el transporte (tunel, red
 * local, otra pasarela) sin tocar la logica de negocio (CLAUDE.md seccion 35).
 *
 * IMPORTANTE: el navegador nunca llama a este cliente. Solo corre en el
 * servidor, de modo que el token compartido jamas viaja al cliente
 * (CLAUDE.md seccion 9).
 */

export interface NovaParkingConfig {
  baseUrl: string;
  token?: string | null;
  timeoutMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Contexto para los logs. Nunca se muestra al usuario. */
  operation: string;
  /** Presupuesto propio, cuando el de la instancia no sirve para esta llamada. */
  timeoutMs?: number;
}

export class NovaParkingClient {
  private readonly baseUrl: string;
  private readonly token: string | null;
  private readonly timeoutMs: number;

  constructor(config: NovaParkingConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token ?? null;
    this.timeoutMs = config.timeoutMs ?? env.NOVA_PARKING_TIMEOUT_MS;
  }

  private async request<T = unknown>(options: RequestOptions): Promise<T> {
    const url = new URL(this.baseUrl + options.path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    // Token compartido acordado con Nova Parking.
    // Ver docs/REQUERIMIENTOS_EDIER.md seccion 3.
    if (this.token) headers['X-Platform-Token'] = this.token;

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
        cache: 'no-store',
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      // El detalle tecnico (host, puerto, ECONNREFUSED) se queda en el log.
      throw new AppError(
        isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
        {
          detail: { operation: options.operation, path: options.path },
          cause: error,
        },
      );
    }

    if (response.status === 404) {
      throw new AppError('NOT_FOUND', {
        publicMessage: 'No encontramos el registro en el sistema del parqueadero.',
        detail: { operation: options.operation, path: options.path },
      });
    }

    if (response.status === 401 || response.status === 403) {
      // Casi siempre significa que el token compartido no coincide.
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        detail: {
          operation: options.operation,
          status: response.status,
          hint:
            'Nova Parking rechazo la autenticacion. Verificar que NOVA_PARKING_TOKEN ' +
            'coincida con PLATFORM_API_TOKEN en el .env de Nova Parking.',
        },
      });
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Una respuesta no-JSON con 200 suele ser una pagina de error del borde
        // de Cloudflare o un HTML de Django DEBUG.
        throw new AppError('UPSTREAM_UNAVAILABLE', {
          detail: {
            operation: options.operation,
            status: response.status,
            bodyPreview: text.slice(0, 300),
          },
        });
      }
    }

    if (!response.ok) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        detail: {
          operation: options.operation,
          status: response.status,
          payload: scrubSecrets(payload),
        },
      });
    }

    return payload as T;
  }

  /**
   * Verifica que el sistema existente responda. Se usa en la pantalla de
   * configuracion del SuperAdmin para diagnosticar el enlace sin adivinar.
   */
  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.request({ path: '/api/platform/health/', operation: 'health' });
      return { ok: true, detail: 'El sistema del parqueadero respondio correctamente.' };
    } catch (error) {
      if (error instanceof AppError) {
        return { ok: false, detail: error.publicMessage };
      }
      return { ok: false, detail: 'No fue posible contactar al sistema del parqueadero.' };
    }
  }

  /**
   * Lectura cruda para el panel del administrador.
   *
   * Es la unica forma que tiene `panel.ts` de hablar con Nova Parking: la regla
   * de "una sola puerta" se mantiene, pero la logica de cada pantalla vive
   * aparte en vez de engordar este archivo.
   *
   * SOLO GET, y no por casualidad: el panel es de solo lectura y aqui no hay
   * manera de escribir aunque alguien lo intente. La misma garantia se le pidio
   * a Nova Parking del lado del servidor (REQUERIMIENTOS_PANEL_ADMIN.md
   * seccion 2), porque una promesa del cliente no protege a nadie.
   *
   * Admite un presupuesto de tiempo propio porque el del kiosco no sirve aqui:
   * alla hay un cliente esperando frente a la pantalla y conviene rendirse
   * rapido, mientras que un reporte del administrador puede tardar. El volcado
   * de exportacion, medido contra el tunel, tarda unos 12 s.
   */
  async read<T = unknown>(
    path: string,
    query: Record<string, string | number | undefined>,
    operation: string,
    timeoutMs?: number,
  ): Promise<T> {
    return this.request<T>({ method: 'GET', path, query, operation, timeoutMs });
  }

  /**
   * Trae un archivo que sirve Nova Parking: hoy, la foto que tomo la camara al
   * entrar el vehiculo (`/media/parking_tickets/...`).
   *
   * No pasa por `request()` porque eso espera JSON y esto son bytes. Lo que si se
   * mantiene es la regla: el navegador nunca habla con el tunel, asi que la foto
   * la baja el servidor con el token y la reenvia (`/api/panel/[slug]/foto`).
   *
   * La ruta se exige que empiece por `/media/` — la decide Nova Parking, pero
   * llega por la URL de una peticion y nadie va a usarla para pedir otra cosa.
   */
  async media(path: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    if (!path.startsWith('/media/') || path.includes('..')) {
      throw new AppError('NOT_FOUND', { detail: { operation: 'media', path } });
    }

    let response: Response;
    try {
      response = await fetch(new URL(this.baseUrl + path), {
        headers: {
          Accept: 'image/*',
          ...(this.token ? { 'X-Platform-Token': this.token } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: 'no-store',
      });
    } catch (error) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        detail: { operation: 'media', path },
        cause: error,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    /*
      Un 404 aqui casi siempre significa que `/media/` sigue cerrado en el tunel
      —esta fuera a proposito desde el primer dia— y no que falte la foto. Lo
      mismo vale para una respuesta que no es una imagen: eso es la pagina de
      error del borde de Cloudflare, no un vehiculo.
    */
    if (!response.ok || !contentType.startsWith('image/')) {
      throw new AppError('NOT_FOUND', {
        publicMessage: 'La foto no esta disponible.',
        detail: { operation: 'media', path, status: response.status, contentType },
      });
    }

    return { bytes: await response.arrayBuffer(), contentType };
  }

  /**
   * Busca el tiquete abierto de un vehiculo.
   *
   * El segmento y el dato de busqueda salen de la configuracion del
   * parqueadero: el carro va por placa y el resto por el codigo del tiquete.
   */
  async findTicket(
    segment: string,
    term: string,
    extraQuery?: string | null,
  ): Promise<NovaTicket | null> {
    /*
      `exact=true` es OBLIGATORIO y no es opcional para nosotros.

      Por defecto esas busquedas son POR PREFIJO, porque el kiosko de efectivo
      de Nova Parking las usa en carrusel. Sin este parametro, buscar "3"
      devuelve los tiquetes 31 y 36 — dos vehiculos distintos. En un kiosco
      autonomo eso significa cobrarle al vehiculo equivocado, y eso no tiene
      vuelta atras.
    */
    const query: Record<string, string> = { term, exact: 'true' };

    // Parametros propios de la regla del sitio, si el parqueadero define alguno.
    for (const [key, value] of new URLSearchParams(extraQuery ?? '')) {
      query[key] = value;
    }

    const payload = await this.request({
      path: `/api/parking/find-ticket/${encodeURIComponent(segment)}/`,
      query,
      operation: `findTicket:${segment}`,
    });
    return normalizeTicket(payload);
  }

  /**
   * Consulta el monto a cobrar. El calculo (tarifa plena, nocturna, convenios,
   * promociones) es responsabilidad exclusiva de Nova Parking: esta plataforma
   * no lo replica ni lo ajusta.
   */
  async getCheckout(
    ticketId: string,
    /**
     * Id del tipo que eligio el cliente, en el catalogo de Nova Parking. Sin
     * el, un tiquete "Por Definir" se cotiza con la tarifa de moto. No escribe
     * nada en el tiquete: solo cambia con que tarifa se calcula.
     */
    vehicleTypeId?: string | null,
  ): Promise<NovaCheckout> {
    /*
      Cuando el tiquete YA esta pagado, este endpoint responde 400 con
      `{"paid": true, "left": 11}` — no existe el campo `already_paid`.
      Tratarlo como error dejaria al cliente viendo un fallo cuando en realidad
      no debe pagar nada, asi que se intercepta y se devuelve como pagado.
      `left` son los minutos que le quedan para salir sin volver a pagar.
    */
    let payload: unknown;
    try {
      payload = await this.request({
        path: `/api/parking/ticket/${encodeURIComponent(ticketId)}/pay-checkout/`,
        query: { vehicle_type: vehicleTypeId ?? undefined },
        operation: 'getCheckout',
      });
    } catch (error) {
      const paid = alreadyPaidPayload(error);
      if (paid) {
        return {
          ticket: { ...emptyTicket(ticketId) },
          amount: 0,
          alreadyPaid: true,
          minutesLeft: paid.left,
        };
      }
      throw error;
    }

    const checkout = normalizeCheckout(payload);
    if (checkout) return checkout;

    /*
      Cuando no hay nada que cobrar, Nova Parking responde `{"price": 0}` a
      secas — sin `id`, sin `code`, sin ningun dato del tiquete. Es el caso de un
      vehiculo que acaba de entrar, o de un tipo al que todavia no le
      configuraron tarifa.

      Cero es un monto valido, no una respuesta rota: tratarlo como fallo le
      mostraba al cliente "el sistema no devolvio un valor valido" cuando lo que
      pasa es que no debe nada. El tiquete lo sabemos igual, porque es el que
      acabamos de pedir.
    */
    const amount = asAmount(isDict(payload) ? payload.price : null);
    if (amount !== null) {
      return { ticket: emptyTicket(ticketId), amount, alreadyPaid: false };
    }

    throw new AppError('UPSTREAM_UNAVAILABLE', {
      publicMessage:
        'El sistema del parqueadero no devolvio un valor a cobrar valido.',
      detail: { ticketId, payload: scrubSecrets(payload) },
    });
  }

  /**
   * Avisa al sistema del parqueadero que el tiquete quedo pagado con tarjeta.
   *
   * Es lo que hace que ese sistema registre el movimiento en su caja
   * (`Kiosco Web Tarjeta`, propia) y **libere el vehiculo**: deja el tiquete en
   * `OUT` con su hora de salida. Sin esta llamada el conductor paga y se queda
   * adentro.
   *
   * NO va al POST de `pay-checkout`, aunque eso fue lo que pedimos al principio:
   * ese endpoint habria descartado los datos del voucher en silencio, habria
   * registrado el cobro como efectivo y no habria liberado el vehiculo. Nova
   * Parking expuso esta ruta aparte para eso.
   *
   * Es idempotente por `transaction_id`: repetir el aviso no duplica el
   * movimiento de caja.
   *
   * Devuelve `false` en vez de lanzar cuando el sistema no confirma: el dinero
   * ya se cobro, asi que el pago no se invalida — se marca para revision.
   */
  async confirmPayment(input: {
    ticketId: string;
    amount: number;
    transactionId: string;
    authorizationCode: string | null;
    receiptNumber: string | null;
    franchise: string | null;
    /**
     * El MISMO tipo con que se cotizo. Nova Parking lo fija en el tiquete dentro
     * de la misma transaccion del cobro: quedan los dos o ninguno.
     */
    vehicleTypeId?: string | null;
  }): Promise<{
    confirmed: boolean;
    retryable: boolean;
    detail: string | null;
    /** Codigo HTTP con que respondio el parqueadero, si respondio. */
    status?: number | null;
  }> {
    try {
      await this.request({
        method: 'POST',
        path: `/api/payments/ticket/${encodeURIComponent(input.ticketId)}/confirmar-externo/`,
        body: {
          amount: input.amount,
          transaction_id: input.transactionId,
          authorization_code: input.authorizationCode ?? undefined,
          receipt_number: input.receiptNumber ?? undefined,
          franchise: input.franchise ?? undefined,
          vehicle_type: input.vehicleTypeId ?? undefined,
          source: 'punto-de-pago-web',
        },
        operation: 'confirmPayment',
      });
      // 201 registrado, 200 ya estaba registrado. Las dos son exito.
      return { confirmed: true, retryable: false, detail: null };
    } catch (error) {
      const status =
        upstreamStatus(error) ??
        (error instanceof AppError && error.code === 'NOT_FOUND' ? 404 : null);

      // 503: la base estaba ocupada y el cobro NO quedo registrado. Reintentar
      // es correcto y necesario.
      const retryable = status === 503;

      console.error('[nova] no se pudo confirmar el pago', {
        ticketId: input.ticketId,
        status,
        retryable,
      });

      return {
        confirmed: false,
        retryable,
        status,
        detail:
          status === 409
            ? 'El tiquete ya fue pagado por otro canal.'
            : status === 400
              ? 'El sistema del parqueadero rechazo los datos del pago.'
              : status === 404
                ? 'El sistema del parqueadero no encontro el tiquete.'
                : status
                  ? `El sistema del parqueadero fallo al registrar el cobro (error ${status}).`
                  : 'No hubo respuesta del sistema del parqueadero.',
      };
    }
  }
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Codigo HTTP que devolvio el sistema del parqueadero, si lo hubo. */
function upstreamStatus(error: unknown): number | null {
  if (!(error instanceof AppError)) return null;
  const detail = error.detail as { status?: number } | undefined;
  return typeof detail?.status === 'number' ? detail.status : null;
}

/**
 * Detecta el `400 {"paid": true, "left": N}` que devuelve `pay-checkout`
 * cuando el tiquete ya esta pagado.
 */
function alreadyPaidPayload(error: unknown): { left: number | null } | null {
  if (!(error instanceof AppError)) return null;
  const detail = error.detail as
    | { status?: number; payload?: { paid?: boolean; left?: number } }
    | undefined;

  if (detail?.status !== 400) return null;
  if (detail.payload?.paid !== true) return null;

  return {
    left: typeof detail.payload.left === 'number' ? detail.payload.left : null,
  };
}

/** Tiquete sin datos, para el caso de "ya pagado" donde no vienen. */
function emptyTicket(id: string): NovaTicket {
  return {
    id,
    code: null,
    plate: null,
    vehicleTypeLabel: null,
    entryAt: null,
    minutes: null,
    customerName: null,
    customerDocument: null,
    status: null,
  };
}
