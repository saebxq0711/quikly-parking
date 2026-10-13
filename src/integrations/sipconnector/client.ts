import { AppError } from '@/lib/errors';
import {
  buildAnulacionData,
  buildCompraData,
  classifyRespuesta,
  isTransientSip,
  parseEnvelope,
  type AnulacionInput,
  type CompraInput,
  type SipConsulta,
  type SipEnvelope,
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
 *  - La nube es inestable: a veces responde `Cod:99,Msj:WebStatus:Timeout` o se
 *    cae la conexion. Eso se reintenta aqui (regla 7 de la guia de certificacion)
 *    y, si persiste, se lanza un error marcado como TRANSITORIO: quien llama sabe
 *    que no hay respuesta, no que la operacion fallo.
 */

/** Intentos por metodo ante un fallo pasajero. `Respuesta` se reintenta en el siguiente sondeo. */
const INTENTOS: Record<string, number> = {
  Version: 2,
  Token: 3,
  EnviarDatos: 3,
  Respuesta: 2,
  Borrar: 3,
};
const PAUSA_REINTENTO_MS = 1_200;

/** Error de la nube de SIP que no dice nada de la operacion: no hubo respuesta. */
export function isSipTransient(error: unknown): boolean {
  return (
    error instanceof AppError &&
    typeof error.detail === 'object' &&
    error.detail !== null &&
    (error.detail as { transitorio?: unknown }).transitorio === true
  );
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    // Por intento. Con reintentos, una llamada completa puede tardar mas.
    this.timeoutMs = config.timeoutMs ?? 12_000;
  }

  private get cacheKey(): string {
    return `${this.config.baseUrl}|${this.config.codigoUnico}|${this.config.usuario}`;
  }

  /**
   * Llamada cruda. Devuelve la envoltura `Cod:/Msj:` ya separada.
   *
   * Reintenta lo pasajero (sin conexion, tiempo agotado, 5xx, `Cod:99` de timeout).
   * Reintentar es seguro en todos los metodos: `EnviarDatos` va con el MISMO
   * IdTransaccion y `Sobreescribir=S`, asi que repetirlo no crea otra operacion.
   */
  private async call(
    method: string,
    params: Record<string, string>,
    verb: 'GET' | 'POST' = 'POST',
  ): Promise<SipEnvelope> {
    const url = new URL(`${this.config.baseUrl}/api/${method}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const intentos = INTENTOS[method] ?? 1;
    let ultimo = '';
    for (let intento = 0; intento < intentos; intento += 1) {
      if (intento > 0) await esperar(PAUSA_REINTENTO_MS);

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
        ultimo = timedOut ? 'tiempo agotado' : 'sin conexion';
        continue;
      }

      const text = await response.text();
      if (response.status >= 500) {
        ultimo = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) {
        throw new AppError('UPSTREAM_UNAVAILABLE', {
          publicMessage:
            'El medio de pago rechazo la comunicacion. Intenta nuevamente.',
          detail: { method, status: response.status, body: text.slice(0, 200) },
        });
      }

      const envelope = parseEnvelope(text);
      if (isTransientSip(envelope)) {
        ultimo = envelope.raw.slice(0, 160);
        continue;
      }
      return envelope;
    }

    throw new AppError('UPSTREAM_TIMEOUT', {
      publicMessage:
        'No fue posible comunicarse con el medio de pago. Intenta nuevamente.',
      // La URL lleva el token y la clave en la cadena de consulta:
      // se registra solo el metodo, nunca la URL completa.
      detail: { method, transitorio: true, intentos, ultimo },
    });
  }

  /* ------------------------------------------------------------ Version */

  /**
   * Version del servicio. Sirve como prueba de vida y NO requiere token, asi
   * que es la unica forma de verificar el enlace sin arriesgar una transaccion.
   *
   * Es el unico metodo que va por GET (el manual dice POST, pero el servicio
   * responde 405; comprobado contra el ambiente de pruebas).
   */
  async version(): Promise<{
    ok: boolean;
    version: string | null;
    code: string;
    message: string;
  }> {
    const envelope = await this.call(
      'Version',
      { CodigoUnico: this.config.codigoUnico },
      'GET',
    );
    return {
      ok: envelope.code === SIP_CODE.OK,
      version: envelope.code === SIP_CODE.OK ? envelope.message : null,
      code: envelope.code,
      message: envelope.message,
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
        // En un fallo el mensaje es el motivo ("Codigo Unico no registrado..."),
        // nunca un token: se conserva para explicarlo en la prueba de conexion.
        detail: { method: 'Token', code: envelope.code, message: envelope.message },
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
   * Consulta el estado de la operacion en el datafono, ya interpretado
   * (`classifyRespuesta`): esperando, iniciada, leyendo, resuelta, vencida, no
   * existe, incierta o error. Lo incierto nunca se da por fallido.
   *
   * El Anexo 3 pide no consultar mas seguido que cada tres segundos: lo cuida
   * quien llama (`refreshPaymentStatus` y la pantalla del kiosco).
   */
  async respuesta(idTransaccion: string): Promise<{
    code: string;
    message: string;
    raw: string;
    consulta: SipConsulta;
  }> {
    const envelope = await this.withToken((token) =>
      this.call('Respuesta', {
        CodigoUnico: this.config.codigoUnico,
        IdTransaccion: idTransaccion,
        token,
        Red: this.config.red,
      }),
    );

    return {
      code: envelope.code,
      message: envelope.message,
      raw: envelope.raw,
      consulta: classifyRespuesta(envelope, idTransaccion),
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
   * borrar, asi que puede responder error y eso es correcto. En el ambiente
   * real (guia de certificacion):
   *   `Cod:00` borrada (no se habia iniciado);
   *   `Cod:17` no estaba entre las borrables: ya se inicio en el datafono, o ya
   *            no existe. NO prueba que no se vaya a cobrar: hay que consultarla;
   *   `Cod:18` ya se resolvio: hay que consultar su resultado.
   */
  async borrar(idTransaccion: string): Promise<{
    deleted: boolean;
    code: string;
    message: string;
    raw: string;
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
      raw: envelope.raw,
    };
  }
}
