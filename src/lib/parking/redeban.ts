import { db } from '../db';
import { AppError } from '../errors';
import { getCredentials } from '../credentials';
import { SipConnectorClient } from '@/integrations/sipconnector/client';
import { describeSipFailure } from '@/integrations/sipconnector/codes';

/**
 * Codigo unico como lo exige SIPConnector: 10 digitos, con ceros a la izquierda.
 * `93554365` responde "Codigo Unico no registrado"; `0093554365` funciona
 * (comprobado en produccion). Mas largo se deja tal cual: no se adivina.
 */
export function normalizeCodigoUnico(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits && digits.length < 10 ? digits.padStart(10, '0') : digits;
}

/** Codigo del datafono: mayusculas y sin espacios, como lo imprime el voucher. */
export function normalizeCodigoTerminal(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Configuracion de SIPConnector POR KIOSCO.
 *
 * Cada parqueadero puede tener varios kioscos de pago y cada uno cobra con su
 * propio datafono: su propio codigo unico, usuario, clave y codigo de terminal. Por eso todo esto se configura
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
  paymentPointId: string,
): Promise<RedebanStatus> {
  const values = await getCredentials({
    provider: 'REDEBAN',
    parkingLotId,
    paymentPointId,
  });

  const missing = REQUIRED.filter((key) => !values[key]).map(
    (key) => REDEBAN_LABELS[key],
  );

  return {
    configured: missing.length === 0,
    missing,
    baseUrl: values.baseUrl ?? null,
    // Se muestra como se usa: con sus 10 digitos.
    codigoUnico: values.codigoUnico ? normalizeCodigoUnico(values.codigoUnico) : null,
    codigoTerminal: values.codigoTerminal ? normalizeCodigoTerminal(values.codigoTerminal) : null,
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
  paymentPointId: string | null,
): Promise<SipConnectorClient> {
  // Cada kiosco cobra con SU datafono: un cobro sin kiosco no tiene a cual enviarse.
  if (!paymentPointId) {
    throw new AppError('VALIDATION', {
      publicMessage:
        'Este punto de pago aun no puede cobrar con tarjeta. Acercate a la oficina del parqueadero.',
      detail: { parkingLotId, falta: 'kiosco' },
    });
  }
  const values = await getCredentials({ provider: 'REDEBAN', parkingLotId, paymentPointId });
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
    // Tambien al leer: un codigo guardado antes sin sus ceros sigue funcionando.
    codigoUnico: normalizeCodigoUnico(values.codigoUnico),
    usuario: values.usuario,
    clave: values.clave,
    codigoTerminal: normalizeCodigoTerminal(values.codigoTerminal),
    red: values.red ?? '0',
  });
}

/** Prueba de vida del medio de pago, sin arriesgar una transaccion. */
export async function testRedebanConnection(
  parkingLotId: string,
  paymentPointId: string,
): Promise<{
  ok: boolean;
  message: string;
}> {
  const lot = await db.parkingLot.findUnique({
    where: { id: parkingLotId },
    select: { id: true },
  });
  if (!lot) return { ok: false, message: 'Parqueadero no encontrado.' };

  try {
    const client = await redebanClientFor(parkingLotId, paymentPointId);
    // `Version` no necesita token: comprueba red y codigo unico.
    const version = await client.version();
    if (!version.ok) {
      return { ok: false, message: describeSipFailure(version.code, version.message).motivo };
    }

    // `Token` comprueba ademas usuario y clave.
    await client.token(true);
    return {
      ok: true,
      // El codigo del datafono no tiene prueba propia: el servicio solo lo valida
      // al recibir un cobro. Se dice para que "Conectado" no se lea como "todo listo".
      message: `Conectado. ${version.version ?? 'Servicio disponible'}. Codigo unico y credenciales validos. El datafono se comprueba con el primer cobro.`,
    };
  } catch (error) {
    if (error instanceof AppError) {
      const detail = error.detail as { code?: unknown; message?: unknown } | undefined;
      if (typeof detail?.code === 'string' && typeof detail.message === 'string') {
        return { ok: false, message: describeSipFailure(detail.code, detail.message).motivo };
      }
      return { ok: false, message: error.publicMessage };
    }
    return { ok: false, message: 'No fue posible comunicarse con el medio de pago.' };
  }
}
