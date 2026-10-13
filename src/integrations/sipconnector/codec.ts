import { SIP_CODE, SIP_OPERATION, describeSipFailure } from './codes';

/**
 * Codificacion y decodificacion del protocolo de texto de SIPConnector V1.5.
 *
 * El protocolo no es JSON: los metodos devuelven una cadena
 * `"Cod:{codigo},Msj:{mensaje}"`, y el mensaje de `Respuesta` es a su vez una
 * lista de campos separados por comas, en orden estricto (Anexo 2).
 *
 * Todo lo de este archivo sale del manual, no de suposiciones. Donde el manual
 * es ambiguo esta anotado explicitamente.
 */

/* ------------------------------------------------------------- Envoltura */

export interface SipEnvelope {
  /** Codigo tecnico del consumo del servicio (Anexo 4). */
  code: string;
  /** Contenido del mensaje, sin el prefijo. */
  message: string;
  /** Cadena original, para el log. */
  raw: string;
}

/**
 * Separa `"Cod:00,Msj:OK,20240128173215,LRC"` en codigo y mensaje.
 *
 * Se corta en la PRIMERA aparicion de `Msj:` y no se vuelve a partir por comas,
 * porque el mensaje de `Respuesta` contiene comas como separador de campos: si
 * se partiera por coma se perderia todo salvo el primer campo.
 */
export function parseEnvelope(raw: string): SipEnvelope {
  // El servicio devuelve la cadena entre comillas dobles.
  const text = raw.trim().replace(/^"|"$/g, '');

  const codeMatch = text.match(/Cod:\s*(\d+)/i);
  const msgIndex = text.search(/Msj:/i);

  return {
    code: codeMatch?.[1]?.padStart(2, '0') ?? '99',
    message: msgIndex >= 0 ? text.slice(msgIndex + 4).trim() : '',
    raw: text,
  };
}

/**
 * Motivo para el panel de un cobro que no llego al datafono, a partir de lo
 * que se guardo en `providerRaw` (`{ enviarDatos: "Cod:99,Msj:..." }`). Null si
 * el cobro si llego: su resultado ya lo explica `failureReason`.
 */
export function enviarDatosFailureFromRaw(providerRaw: unknown): string | null {
  if (!providerRaw || typeof providerRaw !== 'object') return null;
  const raw = (providerRaw as { enviarDatos?: unknown }).enviarDatos;
  if (typeof raw !== 'string') return null;
  const envelope = parseEnvelope(raw);
  if (envelope.code === SIP_CODE.OK) return null;
  return describeSipFailure(envelope.code, envelope.message).motivo;
}

/* --------------------------------------------------------- Datos de envio */

export interface CompraInput {
  /** Valor a cobrar, entero en pesos. */
  amount: number;
  /** Numero de factura del comercio. Maximo 10 caracteres. */
  invoiceNumber: string;
  /** Codigo del cajero que inicia la transaccion. Maximo 10. */
  cashierCode: string;
  /** Codigo del datafono que recibe la operacion. Maximo 10. */
  terminalCode: string;
  /** Numero de la caja donde se inicia. Maximo 10. */
  boxNumber: string;
  /** Numero de recibo del cliente (no el del datafono). Maximo 10. */
  receiptNumber: string;
  /** Minutos que la operacion sigue vigente en el datafono. */
  validityMinutes: number;
  /**
   * `S` mantiene la solicitud disponible si el datafono la rechaza, para poder
   * reintentar; `N` la elimina. Una aprobacion siempre la elimina.
   */
  persist: 'S' | 'N';
  /** Codigo unico del comercio. Se repite cuando no se usa multicomercio. */
  merchantCode: string;
  /** Codigo de ubicacion de Google Maps. Opcional. */
  location?: string;
}

/** Recorta y limpia un campo alfanumerico: la coma es el separador reservado. */
function alpha(value: string | undefined, max: number): string {
  return (value ?? '').replace(/,/g, ' ').trim().slice(0, max);
}

/** Entero sin signos ni separadores, como exige el manual. */
function num(value: number, max: number): string {
  const int = Math.max(0, Math.trunc(value));
  return String(int).slice(0, max);
}

/** El mayor valor que cabe en los 8 digitos del campo de valor. */
export const MAX_AMOUNT = 99_999_999;

/**
 * El valor de una compra o anulacion: entero, mayor que cero y que quepa en el campo.
 *
 * Segunda barrera, aparte de la del servicio de pagos: en la certificacion de Redeban
 * una compra de $0 fue APROBADA por el datafono, y `num()` convertia un negativo en 0
 * y recortaba en silencio un valor de 9 digitos ($123.456.789 salia como
 * $12.345.678). Un valor asi nunca debe llegar a armarse.
 */
function amountField(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_AMOUNT) {
    throw new Error(`Valor de cobro invalido para el datafono: ${value}`);
  }
  return String(value);
}

/**
 * Arma la trama de una operacion de COMPRA (Anexo 1.1).
 *
 * Los 20 campos van en orden estricto. Un campo numerico que no aplica va en
 * cero y uno alfabetico va vacio; ninguno se puede omitir, porque la posicion
 * es lo que identifica al campo.
 *
 * Sobre impuestos: se envian IVA e impuesto al consumo en cero. El sistema del
 * parqueadero entrega un valor total ya calculado y no desglosa impuestos, asi
 * que desglosarlos aqui seria inventarlos. El valor cobrado es siempre el que
 * devuelve ese sistema.
 */
export function buildCompraData(input: CompraInput): string {
  const total = amountField(input.amount);

  return [
    SIP_OPERATION.COMPRA, //  1 Tipo Operacion
    total, //                 2 Valor Venta
    '0', //                   3 Valor IVA
    '0', //                   4 Valor Impuesto al consumo
    '0', //                   5 Valor Propina
    total, //                 6 Valor Total (neto + impuestos, sin propina)
    alpha(input.invoiceNumber, 10), //  7 Numero de Factura
    alpha(input.cashierCode, 10), //    8 Codigo del Cajero
    '0', //                   9 Tipo de combustible (no aplica)
    '0', //                  10 Kilometraje (no aplica)
    '0', //                  11 Galones (no aplica)
    alpha(input.terminalCode, 10), //  12 Codigo de Terminal
    alpha(input.boxNumber, 10), //     13 Numero de Caja
    '0', //                  14 Base Devolucion IVA
    '0', //                  15 Base Impuesto al consumo
    alpha(input.receiptNumber, 10), // 16 Numero de Recibo de Cliente
    num(input.validityMinutes, 3), //  17 Vigencia
    input.persist, //        18 Persiste
    alpha(input.merchantCode, 10), //  19 Codigo Unico Multicomercio
    alpha(input.location, 30), //      20 Ubicacion
  ].join(',');
}

export interface AnulacionInput
  extends Omit<CompraInput, 'receiptNumber' | 'location'> {
  /** Numero del recibo que devolvio la aprobacion de la compra. Maximo 6. */
  approvalReceiptNumber: string;
  /** Clave que el medio de pago pide para autorizar la anulacion. */
  supervisorKey: string;
}

/**
 * Arma la trama de una ANULACION (Anexo 1.2). Son 18 campos, no 20: no lleva
 * recibo de cliente ni ubicacion, y agrega numero de recibo y clave de
 * supervisor.
 */
export function buildAnulacionData(input: AnulacionInput): string {
  const total = amountField(input.amount);

  return [
    SIP_OPERATION.ANULACION, //  1 Tipo Operacion
    total, //                    2 Valor Venta
    '0', //                      3 Valor IVA
    '0', //                      4 Valor Impuesto al consumo
    '0', //                      5 Valor Propina
    total, //                    6 Valor Total
    alpha(input.invoiceNumber, 10), //  7 Numero de Factura
    alpha(input.cashierCode, 10), //    8 Codigo del Cajero
    '0', //                      9 Tipo de combustible
    '0', //                     10 Kilometraje
    '0', //                     11 Galones
    alpha(input.terminalCode, 10), //  12 Codigo de Terminal
    alpha(input.boxNumber, 10), //     13 Numero de Caja
    alpha(input.approvalReceiptNumber, 6), // 14 Numero del Recibo
    alpha(input.supervisorKey, 4), //  15 Clave de Supervisor
    num(input.validityMinutes, 3), //  16 Vigencia
    input.persist, //           17 Persiste
    alpha(input.merchantCode, 10), //  18 Codigo Unico Multicomercio
  ].join(',');
}

/* ------------------------------------------------------ Respuesta (Anexo 2) */

export interface SipTransactionResult {
  /** `00` o `0` significa aprobada; cualquier otro valor, rechazada. */
  responseCode: string | null;
  approved: boolean;
  approvalCode: string | null;
  /** Valor total aprobado. El Anexo 2 exige validarlo contra lo solicitado. */
  totalValue: number | null;
  ivaValue: number | null;
  receiptNumber: string | null;
  /** Consecutivo emitido por el medio de pago. */
  rrn: string | null;
  terminalNumber: string | null;
  /** Fecha en formato AAMMDD tal como la entrega el datafono. */
  date: string | null;
  /** Hora en formato HHMM. */
  time: string | null;
  franchise: string | null;
  /** `AH`/`CC` cuenta debito, `CR` credito. */
  accountType: string | null;
  installments: string | null;
  bin: string | null;
  merchantCode: string | null;
  merchantAddress: string | null;
  boxNumber: string | null;
  cardName: string | null;
  network: string | null;
  invoiceNumber: string | null;
  operationType: string | null;
  cardExpiry: string | null;
  merchantName: string | null;
  /** Campos crudos, por si hace falta diagnosticar. */
  fields: string[];
}

/** Convierte un campo a entero, tolerando vacios y ceros a la izquierda. */
function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const clean = value.trim();
  if (clean === '') return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toText(value: string | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

/**
 * Interpreta el mensaje de `Respuesta` segun el orden de campos del Anexo 2.
 *
 * NOTA HONESTA SOBRE EL MANUAL: el ejemplo de respuesta que trae el documento
 * tiene mas campos de los que lista su propia tabla y no alinea del todo a
 * partir de la mitad. Por eso este parser toma posicionalmente los campos del
 * principio —que si alinean y son los criticos: codigo de respuesta, codigo de
 * aprobacion, valor total, recibo— y deja el resto como mejor esfuerzo,
 * conservando siempre la lista cruda en `fields`.
 *
 * Ningun campo ausente se inventa: queda en null.
 */
export function parseTransactionResult(message: string): SipTransactionResult {
  const fields = message.split(',').map((f) => f.trim());

  const responseCode = toText(fields[0]);
  // El manual advierte que puede venir con uno o dos digitos: 0 o 00 aprobada.
  const approved = responseCode === '00' || responseCode === '0';

  return {
    responseCode,
    approved,
    approvalCode: toText(fields[1]),
    totalValue: toInt(fields[2]),
    ivaValue: toInt(fields[3]),
    receiptNumber: toText(fields[4]),
    rrn: toText(fields[5]),
    terminalNumber: toText(fields[6]),
    date: toText(fields[7]),
    time: toText(fields[8]),
    franchise: toText(fields[9]),
    accountType: toText(fields[10]),
    installments: toText(fields[11]),
    bin: toText(fields[12]),
    merchantCode: toText(fields[13]),
    merchantAddress: toText(fields[14]),
    boxNumber: toText(fields[15]),
    cardName: toText(fields[16]),
    network: toText(fields[25]),
    invoiceNumber: toText(fields[26]),
    operationType: toText(fields[27]),
    cardExpiry: toText(fields[28]),
    merchantName: toText(fields[29]),
    fields,
  };
}

/**
 * Minimo de campos de un resultado financiero real (Anexo 2). Los vistos en el
 * ambiente real traen ~32 (aprobada y rechazada). Un `Cod:00` con menos, como
 * `OK,20240128173215,LRC`, NO es un pago: es una confirmacion tecnica.
 */
const MIN_CAMPOS_RESULTADO = 10;

/** Mensajes de `Cod:99` que son la nube de SIP fallando, no la operacion. */
const SIP_TRANSITORIO = /webstatus\s*:\s*timeout|timed out|time ?out|tiempo de espera/i;

export type SipConsulta =
  /** La orden esta en la nube; el datafono aun no la toma (Cod:00 vacio). */
  | { kind: 'esperando' }
  /** El datafono la tomo (Cod:01). */
  | { kind: 'iniciada' }
  /** El datafono esta leyendo la tarjeta (Cod:02): BIN, tipo de cuenta, franquicia. */
  | { kind: 'leyendo'; lectura: string }
  /** Resultado financiero completo. */
  | { kind: 'resuelta'; result: SipTransactionResult }
  /** La vigencia se agoto: el datafono ya no la puede cobrar. */
  | { kind: 'vencida'; mensaje: string }
  /** El servicio no tiene esa operacion (Cod:99 "No existe IdTransaccion"). */
  | { kind: 'no_existe'; mensaje: string }
  /**
   * No se sabe todavia: un `Cod:00` corto, un `Cod:99` desconocido o un timeout de
   * la nube. Se sigue esperando: cortar aqui puede dejar un pago aprobado que el
   * sistema dio por fallido (regla 6 de la guia de certificacion).
   */
  | { kind: 'incierta'; mensaje: string }
  /** Error de datos o de configuracion (Anexo 4): no se va a resolver solo. */
  | { kind: 'error'; mensaje: string };

/**
 * Interpreta la respuesta del metodo `Respuesta` sin desincronizarse.
 *
 * `idTransaccion`, si se da, se compara con el numero de factura del resultado
 * (campo 27 del Anexo 2, que es el IdTransaccion que se envio): un resultado de
 * OTRA operacion no se toma como el de esta.
 */
export function classifyRespuesta(envelope: SipEnvelope, idTransaccion?: string): SipConsulta {
  const { code, message } = envelope;

  if (code === SIP_CODE.INICIANDO) return { kind: 'iniciada' };
  if (code === SIP_CODE.LEYENDO_TARJETA) return { kind: 'leyendo', lectura: message };

  if (code === SIP_CODE.OK) {
    if (!message) return { kind: 'esperando' };
    const campos = message.split(',').map((c) => c.trim());
    // Solo un resultado con la estructura completa del Anexo 2 es un pago.
    if (campos.length < MIN_CAMPOS_RESULTADO || !/^\d{1,2}$/.test(campos[0] ?? '')) {
      return { kind: 'incierta', mensaje: message };
    }
    const result = parseTransactionResult(message);
    if (idTransaccion && result.invoiceNumber && result.invoiceNumber !== idTransaccion) {
      return {
        kind: 'incierta',
        mensaje: `El resultado es de otra operacion (${result.invoiceNumber}), no de ${idTransaccion}.`,
      };
    }
    return { kind: 'resuelta', result };
  }

  if (code === SIP_CODE.ERROR_TECNICO) {
    if (/vencid|expirad/i.test(message)) return { kind: 'vencida', mensaje: message };
    if (/no existe/i.test(message)) return { kind: 'no_existe', mensaje: message };
    // Timeout de la nube o un 99 que no conocemos: ante la duda, esperar.
    return { kind: 'incierta', mensaje: message };
  }

  return { kind: 'error', mensaje: message };
}

/** Un `Cod:99` que es la nube de SIP fallando (se reintenta), no un rechazo. */
export function isTransientSip(envelope: SipEnvelope): boolean {
  return envelope.code === SIP_CODE.ERROR_TECNICO && SIP_TRANSITORIO.test(envelope.message);
}

/**
 * Enmascara el BIN o el nombre de tarjeta para poder mostrarlo y guardarlo.
 * Nunca se almacena un numero de tarjeta completo.
 */
export function maskCard(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `**** ${digits.slice(-4)}`;
}

/**
 * Motivo de una transaccion NO aprobada, en palabras para el cliente del kiosco.
 *
 * Antes toda no aprobada decia "rechazada por el banco emisor", y no era cierto:
 * en las pruebas del 2026-10-09 el datafono mostraba "no se recibio respuesta
 * del host" (no logro hablar con el autorizador) y el kiosco culpaba al banco.
 * La respuesta del Anexo 2 permite distinguir los casos sin adivinar:
 *
 *  - Tarjeta sin leer: el numero de la tarjeta llega en ceros (`000000**0000`).
 *  - Sin respuesta del autorizador: no hay codigo de aprobacion, el recibo llega
 *    vacio o en ceros y no hay franquicia. Nadie decidio sobre la compra.
 *  - Lo demas: el autorizador respondio y no aprobo.
 */
export function declineReason(result: SipTransactionResult): string {
  const enCeros = (valor: string | null) => !valor || /^0+$/.test(valor);
  const tarjeta = (result.bin ?? result.cardName ?? '').replace(/\s/g, '');

  if (/^0+\*+0+$/.test(tarjeta)) {
    return 'El datáfono no pudo leer la tarjeta. Inténtalo de nuevo o usa otra tarjeta.';
  }
  if (!result.approvalCode && enCeros(result.receiptNumber) && !result.franchise) {
    return 'El datáfono no obtuvo respuesta del banco, así que no se cobró nada. Intenta de nuevo en un momento.';
  }
  return 'Tu banco no aprobó la transacción. Puedes intentar con otra tarjeta.';
}
