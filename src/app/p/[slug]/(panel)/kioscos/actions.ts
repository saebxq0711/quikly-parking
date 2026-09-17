'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { revokeAllSessions } from '@/lib/auth/session';
import { AuditAction, recordAudit } from '@/lib/audit';
import type { ActionResult } from '@/app/admin/actions';

/**
 * Cierra a distancia la sesion de un kiosco de pago.
 *
 * La pantalla del kiosco no tiene un boton de salida a la vista (un cliente la dejaria
 * fuera de servicio), asi que la cierra el administrador de ESE parqueadero. Solo puede
 * cerrar kioscos de su propio parqueadero: el alcance sale de su usuario, no del
 * formulario.
 */
export async function closeKioskSession(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole('ADMIN_PARQUEADERO');
  const userId = String(formData.get('userId') ?? '');

  const kiosco = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      parkingLotId: true,
      paymentPoint: { select: { name: true } },
    },
  });

  if (
    !kiosco ||
    kiosco.role !== 'PUNTO_PAGO' ||
    !admin.parkingLotId ||
    kiosco.parkingLotId !== admin.parkingLotId
  ) {
    return { ok: false, message: 'Kiosco no encontrado.' };
  }

  await revokeAllSessions(kiosco.id);

  await recordAudit({
    action: AuditAction.AUTH_LOGOUT,
    actorId: admin.id,
    parkingLotId: admin.parkingLotId,
    entity: 'User',
    entityId: kiosco.id,
    metadata: { forzado: true, porAdministrador: true },
  });

  revalidatePath('/p/[slug]/kioscos', 'page');
  return {
    ok: true,
    message: `Sesion de ${kiosco.paymentPoint?.name ?? kiosco.email} cerrada. La pantalla vuelve a pedir inicio de sesion.`,
  };
}
