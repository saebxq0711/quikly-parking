import { AppError } from '@/lib/errors';
import {
  buildAnulacionData,
  buildCompraData,
  parseEnvelope,
  parseTransactionResult,
  type AnulacionInput,
  type CompraInput,
  type SipEnvelope,
  type SipTransactionResult,
} from './codec';
import { SIP_CODE, publicMessageForCode } from './codes';

/**
 * Cliente del Web Service SIPConnector V1.5 (Redeban).
 *
 * Implementa TODOS los metodos que expone el servicio:
 *   Version · Token · EnviarDatos · Respuesta · Borrar
 *
 * `Notificar` figura en la lista del manual como el modulo de webhook, pero el
 * ambiente de pruebas responde 404 a `/api/Notificar`: no es un metodo que el
 * comercio invoque, sino el aviso que el servicio envia hacia el comercio. Por
 * eso aqui no hay un metodo `notificar()`; el receptor de ese aviso vive en
 * `src/app/api/sipconnector/webhook/route.ts`.
 *
 * Detalles del protocolo verificados contra el ambiente real, no supuestos:
 *  - Todos los metodos son POST **salvo `Version`**, que responde 405 con POST
 *    y 200 con GET, pese a que el manual dice que todos son POST.
 *  - Los parametros viajan en la cadena de consulta, no en el cuerpo.
 *  - La respuesta es texto entrecomillado, no JSON.
 *  - El token dura 3 minutos.
 */

export interface SipConnectorConfig {
  /** Ej: https://sipconnectortest.azurewebsites.net */
  baseUrl: string;
  /** Codigo unico del comercio, CON los ceros a la izquierda. */
  codigoUnico: string;
  usuario: string;
  clave: string;
  /** Codigo del datafono. */
  codigoTerminal: string;
  /** Red que procesa el pago (Anexo 5). `0` es Redeban. */
  red: string;
  timeoutMs?: number;
}

interface TokenEntry {
  token: string;
  expiresAt: number;
}

/**
 * Cache de token por comercio. El manual dice que dura 3 minutos; se renueva
 * 30 segundos antes para no usar uno que expira mientras viaja.
 */
const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 3 * 60_000;
const TOKEN_MARGIN_MS = 30_000;

export class SipConnectorClient {
  private readonly config: SipConnectorConfig;
  private readonly timeoutMs: number;

  constructor(config: SipConnectorConfig) {
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/+$/, '') };
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  private get cacheKey(): string {
    return `${this.config.baseUrl}|${this.config.codigoUnico}|${this.config.usuario}`;
  }

  /** Llamada cruda. Devuelve la envoltura `Cod:/Msj:` ya separada. */
  private async call(
    method: string,
    params: Record<string, string>,
    verb: 'GET' | 'POST' = 'POST',
  ): Promise<SipEnvelope> {
    const url = new URL(`${this.config.baseUrl}/api/${method}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: verb,
        headers: { Accept: 'text/plain, application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: 'no-store',
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AppError(
        timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
        {
          publicMessage:
            'No fue posible comunicarse con el medio de pago. Intenta nuevamente.',
          // La URL lleva el token y la clave en la cadena de consulta:
          // se registra solo el metodo, nunca la URL completa.
          detail: { method },
          cause: error,
        },
      );
    }

    const text = await response.text();

    if (!response.ok) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage:
          'El medio de pago rechazo la comunicacion. Intenta nuevamente.',
        detail: { method, status: response.status, body: text.slice(0, 200) },
      });
    }

    return parseEnvelope(text);
  }

  /* ------------------------------------------------------------ Version */

  /**
   * Version del servicio. Sirve como prueba de vida y NO requiere token, asi
   * que es la unica forma de verificar el enlace sin arriesgar una transaccion.
   *
   * Es el unico metodo que va por GET (el manual dice POST, pero el servicio
   * responde 405; comprobado contra el ambiente de pruebas).
   */
  async version(): Promise<{ ok: boolean; version: string | null; code: string }> {
    const envelope = await this.call(
      'Version',
      { CodigoUnico: this.config.codigoUnico },
      'GET',
    );
    return {
      ok: envelope.code === SIP_CODE.OK,
      version: envelope.code === SIP_CODE.OK ? envelope.message : null,
      code: envelope.code,
    };
  }

  /* -------------------------------------------------------------- Token */

  /** Token temporal (3 minutos) exigido por los demas metodos. */
  async token(force = false): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (!force && cached && cached.expiresAt > Date.now() + TOKEN_MARGIN_MS) {
      return cached.token;
    }

    const envelope = await this.call('Token', {
      CodigoUnico: this.config.codigoUnico,
      Usuario: this.config.usuario,
      Clave: this.config.clave,
    });

    if (envelope.code !== SIP_CODE.OK || !envelope.message) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage: publicMessageForCode(envelope.code),
        detail: { method: 'Token', code: envelope.code },
      });
    }

    tokenCache.set(this.cacheKey, {
      token: envelope.message,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return envelope.message;
  }

  /** Descarta el token cacheado. Se usa al recibir `Cod:04`. */
  invalidateToken(): void {
    tokenCache.delete(this.cacheKey);
  }

  /**
   * Reintenta una vez con token nuevo cuando el servicio responde que el token
   * no vale. Sin esto, un token vencido entre dos sondeos aborta un cobro que
   * en realidad estaba bien.
   */
  private async withToken(
    run: (token: string) => Promise<SipEnvelope>,
  ): Promise<SipEnvelope> {
    const envelope = await run(await this.token());
    if (
      envelope.code === SIP_CODE.TOKEN_INVALIDO ||
      envelope.code === SIP_CODE.DATOS_TOKEN_INVALIDOS
    ) {
      this.invalidateToken();
      return run(await this.token(true));
    }
    return envelope;
  }

  /* -------------------------------------------------------- EnviarDatos */

  /**
   * Deja la orden de cobro en la nube de SIPConnector para que el datafono la
   * tome. NO cobra por si sola: el cliente debe iniciar la operacion en el
   * datafono (el manual llama a eso "presionar la tecla verde").
   *
   * El manual insiste: hay que validar el mensaje devuelto antes de dar por
   * enviada la operacion.
   */
  async enviarDatos(params: {
    idTransaccion: string;
    data: string;
    sobreescribir?: 'S' | 'N';
  }): Promise<{ accepted: boolean; code: string; message: string; raw: string }> {
    const envelope = await this.withToken((token) =>
      this.call('EnviarDatos', {
        CodigoUnico: this.config.codigoUnico,
        IdTransaccion: params.idTransaccion,
        Data: params.data,
        token,
        Sobreescribir: params.sobreescribir ?? 'S',
        Red: this.config.red,
      }),
    );

    return {
      accepted: envelope.code === SIP_CODE.OK,
      code: envelope.code,
      message: envelope.message,
      raw: envelope.raw,
    };
  }

  /** Orden de compra, armando la trama del Anexo 1.1. */
  async enviarCompra(
    idTransaccion: string,
    input: Omit<CompraInput, 'terminalCode' | 'merchantCode'>,
  ) {
    return this.enviarDatos({
      idTransaccion,
      data: buildCompraData({
        ...input,
        terminalCode: this.config.codigoTerminal,
        merchantCode: this.config.codigoUnico,
      }),
    });
  }

  /** Orden de anulacion, armando la trama del Anexo 1.2. */
  async enviarAnulacion(
    idTransaccion: string,
    input: Omit<AnulacionInput, 'terminalCode' | 'merchantCode'>,
  ) {
    return this.enviarDatos({
      idTransaccion,
      data: buildAnulacionData({
        ...input,
        terminalCode: this.config.codigoTerminal,
        merchantCode: this.config.codigoUnico,
      }),
    });
  }

  /* ----------------------------------------------------------- Respuesta */

  /**
   * Consulta el estado de la operacion en el datafono.
   *
   * Los tres desenlaces posibles, todos vistos en el ambiente real:
   *  - `Cod:00` con mensaje VACIO: la orden esta puesta pero el datafono aun no
   *    la tomo. El cliente todavia no ha iniciado la operacion.
   *  - `Cod:01` / `Cod:02`: el datafono ya esta trabajando (tecla verde
   *    presionada, o leyendo la tarjeta).
   *  - `Cod:00` con campos: la transaccion se resolvio; el primer campo dice si
   *    fue aprobada o rechazada.
   *
   * El Anexo 3 pide no consultar mas seguido que cada tres segundos.
   */
  async respuesta(idTransaccion: string): Promise<{
    code: string;
    /** Todavia no hay desenlace financiero. */
    pending: boolean;
    /** El datafono ya inicio la operacion. */
    started: boolean;
    /** Datos del datafono mientras lee la tarjeta (Cod:02). */
    reading: string | null;
    result: SipTransactionResult | null;
    message: string;
    raw: string;
  }> {
    const envelope = await this.withToken((token) =>
      this.call('Respuesta', {
        CodigoUnico: this.config.codigoUnico,
        IdTransaccion: idTransaccion,
        token,
        Red: this.config.red,
      }),
    );

    if (envelope.code === SIP_CODE.INICIANDO) {
      return {
        code: envelope.code,
        pending: true,
        started: true,
        reading: null,
        result: null,
        message: envelope.message,
        raw: envelope.raw,
      };
    }

    if (envelope.code === SIP_CODE.LEYENDO_TARJETA) {
      return {
        code: envelope.code,
        pending: true,
        started: true,
        // Trae BIN, tipo de cuenta y franquicia mientras el cliente decide.
        reading: envelope.message,
        result: null,
        message: envelope.message,
        raw: envelope.raw,
      };
    }

    if (envelope.code !== SIP_CODE.OK) {
      return {
        code: envelope.code,
        pending: false,
        started: false,
        reading: null,
        result: null,
        message: envelope.message,
        raw: envelope.raw,
      };
    }

    // Cod:00 con mensaje vacio = la orden espera a que alguien la tome.
    if (!envelope.message) {
      return {
        code: envelope.code,
        pending: true,
        started: false,
        reading: null,
        result: null,
        message: '',
        raw: envelope.raw,
      };
    }

    return {
      code: envelope.code,
      pending: false,
      started: true,
      reading: null,
      result: parseTransactionResult(envelope.message),
      message: envelope.message,
      raw: envelope.raw,
    };
  }

  /* -------------------------------------------------------------- Borrar */

  /**
   * Elimina una transaccion del servicio.
   *
   * Es lo que libera la terminal cuando una orden quedo colgada: sin esto, el
   * siguiente cobro sobre ese datafono recibe
   * `Cod:06 Ya existe una transaccion asignada a esta terminal` y la caja queda
   * bloqueada. El manual advierte que una operacion en curso no se puede
   * borrar, asi que puede responder error y eso es correcto.
   */
  async borrar(idTransaccion: string): Promise<{
    deleted: boolean;
    code: string;
    message: string;
  }> {
    const envelope = await this.withToken((token) =>
      this.call('Borrar', {
        CodigoUnico: this.config.codigoUnico,
        IdTransaccion: idTransaccion,
        token,
        Red: this.config.red,
      }),
    );

    return {
      deleted: envelope.code === SIP_CODE.OK,
      code: envelope.code,
      message: envelope.message,
    };
  }
}
