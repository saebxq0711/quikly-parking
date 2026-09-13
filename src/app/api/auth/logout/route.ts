import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { destroySession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { AuditAction, recordAudit, requestContext } from '@/lib/audit';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';

const schema = z.object({ password: z.string().max(200).optional() });

/**
 * Cierre de sesion.
 *
 * Para el punto de pago se exige la contrasena del operador: el kiosco esta de
 * cara al publico y un boton de salida sin proteccion dejaria la caja fuera de
 * servicio con un solo toque de cualquiera. Los demas roles trabajan en un
 * equipo propio y salen directamente.
 */
export async function POST(request: Request) {
  const ctx = requestContext(request);

  try {
    const user = await getCurrentUser();

    if (user?.role === 'PUNTO_PAGO') {
      consumeRateLimit({ key: `logout:${user.id}`, limit: 8, windowMs: 60_000 });

      const body = await request.json().catch(() => ({}));
      const parsed = schema.safeParse(body);
      const password = parsed.success ? parsed.data.password : undefined;

      if (!password) {
        throw new AppError('VALIDATION', {
          publicMessage: 'Escribe tu contrasena para salir.',
        });
      }

      const stored = await db.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      const ok =
        stored !== null && (await verifyPassword(stored.passwordHash, password));

      if (!ok) {
        await recordAudit({
          action: AuditAction.AUTH_LOGIN_FAILED,
          actorId: user.id,
          parkingLotId: user.parkingLotId,
          metadata: { reason: 'contrasena incorrecta al cerrar el punto de pago' },
          ...ctx,
        });
        throw new AppError('UNAUTHENTICATED', {
          publicMessage: 'Contrasena incorrecta.',
        });
      }
    }

    await destroySession();

    if (user) {
      await recordAudit({
        action: AuditAction.AUTH_LOGOUT,
        actorId: user.id,
        parkingLotId: user.parkingLotId,
        ...ctx,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, 'auth/logout');
  }
}
