import { db } from '../db';
import { AppError } from '../errors';
import { getCredentials } from '../credentials';
import { SipConnectorClient } from '@/integrations/sipconnector/client';

/**
 * Configuracion de SIPConnector POR PARQUEADERO.
 *
 * Cada parqueadero es un comercio distinto ante la red: tiene su propio codigo
 * unico, su propio usuario y su propio datafono. Por eso todo esto se configura
 * desde la administracion y se guarda cifrado, no en variables de entorno: una
 * sola web atiende varios parqueaderos y no puede compartir credenciales entre
 * ellos.
 */

/** Claves que el SuperAdmin configura para cada parqueadero. */
export const REDEBAN_KEYS = {
  baseUrl: 'baseUrl',
  codigoUnico: 'codigoUnico',
  usuario: 'usuario',
  clave: 'clave',
  codigoTerminal: 'codigoTerminal',
  red: 'red',
} as const;

/** Cuales son obligatorias para poder cobrar. */
const REQUIRED: (keyof typeof REDEBAN_KEYS)[] = [
  'baseUrl',
  'codigoUnico',
  'usuario',
  'clave',
  'codigoTerminal',
];

export const REDEBAN_LABELS: Record<string, string> = {
  baseUrl: 'URL del servicio SIPConnector',
  codigoUnico: 'Codigo unico del comercio',
  usuario: 'Usuario',
  clave: 'Clave',
  codigoTerminal: 'Codigo del datafono',
  red: 'Red que procesa el pago',
};

export interface RedebanStatus {
  configured: boolean;
  missing: string[];
  /** Datos no sensibles, aptos para mostrar en la administracion. */
  baseUrl: string | null;
  codigoUnico: string | null;
  codigoTerminal: string | null;
  red: string;
}

/** Estado de la configuracion, para la pantalla del SuperAdmin. */
export async function getRedebanStatus(
  parkingLotId: string,
): Promise<RedebanStatus> {
  const values = await getCredentials({
    provider: 'REDEBAN',
    parkingLotId,
  });

  const missing = REQUIRED.filter((key) => !values[key]).map(
    (key) => REDEBAN_LABELS[key],
  );

  return {
    configured: missing.length === 0,
    missing,
    baseUrl: values.baseUrl ?? null,
    codigoUnico: values.codigoUnico ?? null,
    codigoTerminal: values.codigoTerminal ?? null,
    red: values.red ?? '0',
  };
}

/**
 * Cliente de SIPConnector para este parqueadero.
 *
 * Falla con un mensaje concreto si falta configuracion, en vez de intentar
 * cobrar con credenciales incompletas y dejar al cliente delante de un error
 * que no sabe interpretar ni resolver.
 */
export async function redebanClientFor(
  parkingLotId: string,
): Promise<SipConnectorClient> {
  const values = await getCredentials({ provider: 'REDEBAN', parkingLotId });
  const missing = REQUIRED.filter((key) => !values[key]);

  if (missing.length > 0) {
    throw new AppError('VALIDATION', {
      publicMessage:
        'Este punto de pago aun no puede cobrar con tarjeta. Acercate a la oficina del parqueadero.',
      detail: {
        parkingLotId,
        falta: missing.map((key) => REDEBAN_LABELS[key]),
      },
    });
  }

  return new SipConnectorClient({
    baseUrl: values.baseUrl,
    codigoUnico: values.codigoUnico,
    usuario: values.usuario,
    clave: values.clave,
    codigoTerminal: values.codigoTerminal,
    red: values.red ?? '0',
  });
}

/** Prueba de vida del medio de pago, sin arriesgar una transaccion. */
export async function testRedebanConnection(parkingLotId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const lot = await db.parkingLot.findUnique({
    where: { id: parkingLotId },
    select: { id: true },
  });
  if (!lot) return { ok: false, message: 'Parqueadero no encontrado.' };

  try {
    const client = await redebanClientFor(parkingLotId);
    // `Version` no necesita token: comprueba red y codigo unico.
    const version = await client.version();
    if (!version.ok) {
      return {
        ok: false,
        message: `El servicio respondio con el codigo ${version.code}.`,
      };
    }

    // `Token` comprueba ademas usuario y clave.
    await client.token(true);
    return {
      ok: true,
      message: `Conectado. ${version.version ?? 'Servicio disponible'}. Credenciales validas.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AppError
          ? error.publicMessage
          : 'No fue posible comunicarse con el medio de pago.',
    };
  }
}
