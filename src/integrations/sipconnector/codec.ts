import { SIP_OPERATION } from './codes';

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
  const total = num(input.amount, 8);

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
  const total = num(input.amount, 8);

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
 * Enmascara el BIN o el nombre de tarjeta para poder mostrarlo y guardarlo.
 * Nunca se almacena un numero de tarjeta completo.
 */
export function maskCard(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `**** ${digits.slice(-4)}`;
}
