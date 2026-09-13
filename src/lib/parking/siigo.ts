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
