'use server';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '@/lib/auth/password';
import { readSessionCookie } from '@/lib/auth/session';
import { AuditAction, recordAudit } from '@/lib/audit';
import { consumeRateLimit } from '@/lib/rate-limit';
import type { ActionResult } from '@/app/admin/actions';

const fail = (message: string): ActionResult => ({ ok: false, message });

/**
 * Cambio de contrasena de la propia cuenta: la actual, la nueva y su confirmacion.
 *
 * Pedir la actual evita que alguien que encuentre una sesion abierta se quede con la
 * cuenta. Al cambiarla se cierran las DEMAS sesiones (otro equipo, alguien que la
 * conocia); la de quien la cambia sigue abierta, para no sacarlo de donde esta.
 */
export async function changeOwnPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    consumeRateLimit({ key: `cambio-clave:${user.id}`, limit: 5, windowMs: 10 * 60_000 });
  } catch {
    return fail('Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.');
  }

  const actual = String(formData.get('currentPassword') ?? '');
  const nueva = String(formData.get('newPassword') ?? '');
  const confirmacion = String(formData.get('confirmPassword') ?? '');

  if (!actual || !nueva || !confirmacion) return fail('Completa los tres campos.');
  if (nueva !== confirmacion) {
    return fail('La nueva contrasena y su confirmacion no coinciden.');
  }
  const debil = validatePasswordStrength(nueva);
  if (debil) return fail(debil);
  if (nueva === actual) return fail('La nueva contrasena debe ser distinta de la actual.');

  const cuenta = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!cuenta || !(await verifyPassword(cuenta.passwordHash, actual))) {
    return fail('La contrasena actual no es correcta.');
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(nueva),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  const claims = await readSessionCookie();
  await db.session.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(claims ? { id: { not: claims.sessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    action: AuditAction.USER_PASSWORD_CHANGED,
    actorId: user.id,
    parkingLotId: user.parkingLotId,
    entity: 'User',
    entityId: user.id,
    metadata: { cambioPropio: true },
  });

  return {
    ok: true,
    message: 'Listo, tu contrasena quedo cambiada. Las demas sesiones de tu cuenta se cerraron.',
  };
}
