import { AppError } from '../errors';
import { getCredentials } from '../credentials';
import { SiigoClient } from '@/integrations/siigo/client';
import {
  findMissingSettings,
  type SiigoInvoiceSettings,
} from '@/integrations/siigo/invoice-payload';

/**
 * Configuracion de facturacion POR PARQUEADERO.
 *
 * Cada parqueadero factura con su propia empresa: sus credenciales de SIIGO, su
 * numeracion, su vendedor y su propia base de clientes. Por eso todo esto vive
 * en la ficha del sitio y no en una configuracion comun — dos parqueaderos no
 * pueden emitir facturas bajo el mismo NIT.
 */

export const SIIGO_LABELS: Record<string, string> = {
  username: 'Usuario de la API',
  accessKey: 'Clave de acceso',
  documentId: 'Tipo de comprobante',
  sellerId: 'Vendedor',
  paymentTypeId: 'Forma de pago',
  itemCode: 'Codigo del servicio',
};

/** Sin estas no se puede emitir una factura. */
const REQUIRED = [
  'username',
  'accessKey',
  'documentId',
  'sellerId',
  'paymentTypeId',
  'itemCode',
];

export interface SiigoStatus {
  configured: boolean;
  missing: string[];
  enabled: boolean;
  username: string | null;
  hasAccessKey: boolean;
  settings: SiigoInvoiceSettings;
}

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/** Valores de facturacion de este parqueadero. */
export async function getSiigoSettings(
  parkingLotId: string,
): Promise<SiigoInvoiceSettings> {
  const values = await getCredentials({ provider: 'SIIGO', parkingLotId });

  return {
    documentId: toInt(values.documentId),
    sellerId: toInt(values.sellerId),
    paymentTypeId: toInt(values.paymentTypeId),
    itemCode: values.itemCode ?? null,
    itemDescription: values.itemDescription ?? 'Servicio de parqueadero',
    defaultCustomerIdType: values.defaultCustomerIdType ?? '13',
    defaultCustomerIdentification: values.defaultCustomerIdentification ?? null,
    defaultCustomerName: values.defaultCustomerName ?? 'Consumidor final',
    sendStamp: values.sendStamp === 'true',
    sendMail: values.sendMail === 'true',
  };
}

/** Estado de la configuracion, para la pantalla del SuperAdmin. */
export async function getSiigoStatus(
  parkingLotId: string,
): Promise<SiigoStatus> {
  const values = await getCredentials({ provider: 'SIIGO', parkingLotId });
  const settings = await getSiigoSettings(parkingLotId);

  const missing = REQUIRED.filter((key) => !values[key]).map(
    (key) => SIIGO_LABELS[key],
  );

  return {
    configured: missing.length === 0,
    missing: [...missing, ...findMissingSettings(settings)].filter(
      (item, index, all) => all.indexOf(item) === index,
    ),
    enabled: values.enabled === 'true',
    username: values.username ?? null,
    hasAccessKey: Boolean(values.accessKey),
    settings,
  };
}

/**
 * Cliente de SIIGO de este parqueadero.
 *
 * Falla con un mensaje concreto si falta configuracion, en vez de intentar
 * facturar con credenciales incompletas.
 */
export async function siigoClientFor(
  parkingLotId: string,
): Promise<SiigoClient> {
  const values = await getCredentials({ provider: 'SIIGO', parkingLotId });

  if (!values.username || !values.accessKey) {
    throw new AppError('VALIDATION', {
      publicMessage: 'La facturacion no esta configurada para este parqueadero.',
      detail: { parkingLotId },
    });
  }

  return new SiigoClient({
    baseUrl: values.baseUrl ?? 'https://api.siigo.com',
    username: values.username,
    accessKey: values.accessKey,
    // El Partner-Id NO admite guiones ni puntos: con ellos el servicio responde
    // `invalid_partner_id` en todos los endpoints salvo el de autenticacion.
    partnerId: values.partnerId ?? 'QuiklyParking',
  });
}

/** True si este parqueadero tiene la facturacion activada. */
export async function isSiigoEnabled(parkingLotId: string): Promise<boolean> {
  const values = await getCredentials({ provider: 'SIIGO', parkingLotId });
  return values.enabled === 'true';
}

/* ------------------------------------------------------------- Catalogos */

export interface SiigoOption {
  value: string;
  label: string;
}

export type SiigoCatalogs =
  | {
      ok: true;
      documents: SiigoOption[];
      sellers: SiigoOption[];
      paymentTypes: SiigoOption[];
      products: SiigoOption[];
    }
  | { ok: false; message: string };

type Dict = Record<string, unknown>;

function filas(respuesta: unknown): Dict[] {
  const lista = Array.isArray(respuesta)
    ? respuesta
    : ((respuesta as { results?: unknown[] } | null)?.results ?? []);
  return lista.filter((item): item is Dict => typeof item === 'object' && item !== null);
}

const activo = (item: Dict) => item.active !== false;

async function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, reject) => {
        reloj = setTimeout(() => reject(new Error('SIIGO no respondio a tiempo.')), ms);
      }),
    ]);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Comprobantes de factura, vendedores, formas de pago y productos de la empresa en
 * SIIGO, para elegirlos de una lista en vez de escribir ids a mano. Si SIIGO rechaza
 * las credenciales o no responde, la pantalla vuelve a los campos de texto.
 */
export async function getSiigoCatalogs(parkingLotId: string): Promise<SiigoCatalogs> {
  const values = await getCredentials({ provider: 'SIIGO', parkingLotId });
  if (!values.username || !values.accessKey) {
    return { ok: false, message: 'Guarda primero el usuario y la clave de acceso de SIIGO.' };
  }

  try {
    const client = await siigoClientFor(parkingLotId);
    const [documentos, usuarios, pagos, productos] = await conLimite(
      Promise.all([
        client.get<unknown>('/v1/document-types?type=FV'),
        client.get<unknown>('/v1/users?page_size=100'),
        client.get<unknown>('/v1/payment-types?document_type=FV'),
        client.get<unknown>('/v1/products?page_size=100'),
      ]),
      12_000,
    );

    return {
      ok: true,
      documents: filas(documentos)
        .filter(activo)
        .map((doc) => ({
          value: String(doc.id),
          label: `${String(doc.name ?? 'Factura de venta')}${doc.code !== undefined ? ` (codigo ${String(doc.code)})` : ''}${
            String(doc.electronic_type ?? '').toLowerCase().startsWith('electronic') ? ' · electronica' : ''
          }`,
        })),
      sellers: filas(usuarios)
        .filter(activo)
        .map((usuario) => ({
          value: String(usuario.id),
          label:
            [usuario.first_name, usuario.last_name].filter(Boolean).join(' ') ||
            String(usuario.username ?? usuario.id),
        })),
      paymentTypes: filas(pagos)
        .filter(activo)
        .map((pago) => ({ value: String(pago.id), label: String(pago.name ?? pago.id) })),
      products: filas(productos)
        .filter((producto) => activo(producto) && producto.code !== undefined)
        .map((producto) => ({
          value: String(producto.code),
          label: `${String(producto.code)} · ${String(producto.name ?? '')}`,
        })),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof AppError ? error.publicMessage : 'SIIGO no respondio a tiempo.',
    };
  }
}

/* ---------------------------------------------------- Verificacion */

export interface SiigoConfigToCheck {
  documentId: number;
  sellerId: number;
  paymentTypeId: number;
  itemCode: string;
  sendStamp: boolean;
}

/**
 * Compara la configuracion con lo que de verdad hay en SIIGO, sin emitir nada.
 *
 * Existe porque SIIGO solo dice que algo esta mal cuando se intenta facturar: el
 * parqueadero 122 tuvo guardado un comprobante NO electronico con el envio a la DIAN
 * activado, y cada cobro habria quedado sin factura. Devuelve los problemas en
 * lenguaje del SuperAdmin; lista vacia = la configuracion es coherente.
 *
 * Lanza AppError si SIIGO no responde o rechaza las credenciales: eso no es un
 * problema de la configuracion y quien llama decide que hacer.
 */
export async function verifySiigoConfig(
  client: SiigoClient,
  config: SiigoConfigToCheck,
): Promise<string[]> {
  const [documentos, pagos, usuarios, productos] = await conLimite(
    Promise.all([
      client.get<unknown>('/v1/document-types?type=FV'),
      client.get<unknown>('/v1/payment-types?document_type=FV'),
      client.get<unknown>('/v1/users?page_size=100'),
      client.get<unknown>(`/v1/products?code=${encodeURIComponent(config.itemCode)}`),
    ]),
    15_000,
  );

  const problemas: string[] = [];

  const doc = filas(documentos).find((d) => Number(d.id) === config.documentId);
  if (!doc) {
    problemas.push(`El comprobante ${config.documentId} no existe en SIIGO.`);
  } else if (!activo(doc)) {
    problemas.push(`El comprobante "${String(doc.name)}" esta inactivo en SIIGO.`);
  } else {
    const tipo = String(doc.electronic_type ?? '');
    const electronico = tipo === 'ElectronicInvoice';
    if (tipo === 'ExportInvoice') {
      problemas.push(`El comprobante "${String(doc.name)}" es de exportacion: elige uno de factura de venta.`);
    } else if (config.sendStamp && !electronico) {
      problemas.push(
        `El comprobante "${String(doc.name)}" no es electronico, asi que no se puede enviar a la DIAN. Elige uno marcado "electronica" o desactiva el envio a la DIAN.`,
      );
    } else if (!config.sendStamp && electronico) {
      problemas.push(
        `El comprobante "${String(doc.name)}" es de factura electronica: SIIGO exige enviarlo a la DIAN. Activa "Enviar la factura a la DIAN".`,
      );
    }
  }

  const pago = filas(pagos).find((p) => Number(p.id) === config.paymentTypeId);
  if (!pago) {
    problemas.push(`La forma de pago ${config.paymentTypeId} no existe para facturas en SIIGO.`);
  } else if (!activo(pago)) {
    problemas.push(`La forma de pago "${String(pago.name)}" esta inactiva en SIIGO.`);
  }

  /*
    Los vendedores vienen paginados: si no aparece en la primera pagina pero hay mas,
    no se puede afirmar que no exista, y no se reporta.
  */
  const listaUsuarios = filas(usuarios);
  const totalUsuarios = Number(
    (usuarios as { pagination?: { total_results?: number } } | null)?.pagination?.total_results ??
      listaUsuarios.length,
  );
  const vendedor = listaUsuarios.find((u) => Number(u.id) === config.sellerId);
  if (vendedor && !activo(vendedor)) {
    problemas.push(`El vendedor ${config.sellerId} esta inactivo en SIIGO.`);
  } else if (!vendedor && totalUsuarios <= listaUsuarios.length) {
    problemas.push(`El vendedor ${config.sellerId} no existe en SIIGO.`);
  }

  const producto = filas(productos).find((p) => String(p.code) === config.itemCode);
  if (!producto) {
    problemas.push(`El servicio con codigo ${config.itemCode} no existe en SIIGO.`);
  } else if (!activo(producto)) {
    problemas.push(`El servicio "${String(producto.name)}" esta inactivo en SIIGO.`);
  }

  return problemas;
}

/** True si el error es SIIGO rechazando el usuario o la clave (no una caida). */
export function isSiigoCredentialError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.detail as { credencialesRechazadas?: boolean } | undefined)?.credencialesRechazadas === true
  );
}

/** Resultado de comprobar las credenciales de SIIGO de un parqueadero. */
export type SiigoCredentialCheck = 'ok' | 'rejected' | 'unknown' | 'missing';

/**
 * Comprueba en vivo que SIIGO acepte el usuario y la clave de este parqueadero.
 *
 * Existe porque "configurado" no es "funciona": el 122 tenia todo guardado y la
 * preparacion decia "Listo" mientras SIIGO rechazaba la clave y ninguna factura
 * salia. Un solo pedido liviano con limite de 5 s; si SIIGO no responde a tiempo
 * se devuelve `unknown` y no se marca nada: lo lento no es lo mismo que lo malo.
 */
export async function checkSiigoCredentials(parkingLotId: string): Promise<SiigoCredentialCheck> {
  const values = await getCredentials({ provider: 'SIIGO', parkingLotId });
  if (!values.username || !values.accessKey) return 'missing';
  try {
    const client = await siigoClientFor(parkingLotId);
    await conLimite(client.get<unknown>('/v1/document-types?type=FV'), 5_000);
    return 'ok';
  } catch (error) {
    return isSiigoCredentialError(error) ? 'rejected' : 'unknown';
  }
}
