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
    partnerId: values.partnerId ?? 'PuntoPagoParking',
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
