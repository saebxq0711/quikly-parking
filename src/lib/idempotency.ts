import { Prisma } from '@prisma/client';
import { db } from './db';

/**
 * Idempotencia de pagos (CLAUDE.md seccion 23).
 *
 * Un cobro es una operacion critica: un doble clic, un refresh, un reintento de
 * red o una reconexion no pueden producir dos cobros. El cliente envia una
 * clave unica por intento; si la misma clave vuelve a llegar, se devuelve el
 * pago que ya se creo en vez de crear otro.
 *
 * La garantia real la da la clave primaria de `idempotency_keys`: dos
 * peticiones simultaneas con la misma clave compiten por el mismo INSERT y solo
 * una gana, sin importar cuantas instancias de la aplicacion haya corriendo.
 */

const TTL_HOURS = 24;

export interface IdempotencyOutcome {
  /** true si esta peticion es la primera con esa clave. */
  isNew: boolean;
  /** Pago ya asociado a la clave, si lo hay. */
  paymentId: string | null;
}

/**
 * Reclama la clave. Si ya existia, devuelve el pago asociado.
 */
export async function claimIdempotencyKey(
  key: string,
  scope: string,
): Promise<IdempotencyOutcome> {
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  try {
    await db.idempotencyKey.create({ data: { key, scope, expiresAt } });
    return { isNew: true, paymentId: null };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await db.idempotencyKey.findUnique({ where: { key } });
      return { isNew: false, paymentId: existing?.paymentId ?? null };
    }
    throw error;
  }
}

/** Asocia el pago creado a la clave, para que un reintento lo recupere. */
export async function attachPaymentToKey(
  key: string,
  paymentId: string,
): Promise<void> {
  await db.idempotencyKey
    .update({ where: { key }, data: { paymentId } })
    .catch(() => undefined);
}

/**
 * Libera la clave cuando la operacion fallo antes de crear el pago, para que el
 * operador pueda reintentar de inmediato sin esperar el TTL.
 */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await db.idempotencyKey
    .deleteMany({ where: { key, paymentId: null } })
    .catch(() => undefined);
}

/**
 * Id de transaccion para SIPConnector.
 *
 * Restriccion del manual (campo IdTransaccion, seccion 1.3): longitud mayor que
 * 0 y MENOR O IGUAL A 10 caracteres. Un cuid de Prisma mide 25, asi que no
 * sirve tal cual. Se usa una base temporal en base 36 mas un sufijo aleatorio:
 * 10 caracteres exactos, monotono en el tiempo y sin colisiones practicas.
 */
export function buildProviderTransactionId(): string {
  const time = Date.now().toString(36).slice(-7); // ~7 caracteres
  const random = Math.floor(Math.random() * 46_656)
    .toString(36)
    .padStart(3, '0');
  return `${time}${random}`.slice(0, 10).toUpperCase();
}
