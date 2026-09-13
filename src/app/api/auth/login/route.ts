import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { homePathForRole } from '@/lib/auth/guards';
import { AuditAction, recordAudit, requestContext } from '@/lib/audit';
import { consumeRateLimit, resetRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email('Correo invalido').max(200),
  password: z.string().min(1, 'Ingresa tu contrasena').max(200),
});

/** Intentos fallidos antes de bloquear temporalmente la cuenta. */
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  const ctx = requestContext(request);

  try {
    // Limite por IP: frena el ataque de fuerza bruta antes de tocar la base.
    consumeRateLimit({
      key: `login:${ctx.ip ?? 'desconocida'}`,
      limit: 10,
      windowMs: 60_000,
    });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage: parsed.error.issues[0]?.message ?? 'Datos invalidos.',
      });
    }

    const email = parsed.data.email.trim().toLowerCase();

    const user = await db.user.findUnique({
      where: { email },
      include: { parkingLot: { select: { slug: true, active: true } } },
    });

    // Mensaje unico para usuario inexistente y contrasena incorrecta: no se le
    // confirma a un atacante que un correo existe en el sistema.
    const invalidCredentials = new AppError('UNAUTHENTICATED', {
      publicMessage: 'Correo o contrasena incorrectos.',
    });

    if (!user) {
      await recordAudit({
        action: AuditAction.AUTH_LOGIN_FAILED,
        metadata: { email, reason: 'usuario inexistente' },
        ...ctx,
      });
      throw invalidCredentials;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new AppError('RATE_LIMITED', {
        publicMessage: `Cuenta bloqueada temporalmente. Intenta en ${minutes} minuto(s).`,
      });
    }

    const passwordOk = await verifyPassword(user.passwordHash, parsed.data.password);

    if (!passwordOk) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil:
            failed >= MAX_FAILED
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      });
      await recordAudit({
        action: AuditAction.AUTH_LOGIN_FAILED,
        actorId: user.id,
        parkingLotId: user.parkingLotId,
        metadata: { reason: 'contrasena incorrecta', failedCount: failed },
        ...ctx,
      });
      throw invalidCredentials;
    }

    if (!user.active) {
      throw new AppError('FORBIDDEN', {
        publicMessage: 'Tu usuario esta desactivado. Contacta al administrador.',
      });
    }

    if (user.role !== 'SUPERADMIN' && user.parkingLot && !user.parkingLot.active) {
      throw new AppError('FORBIDDEN', {
        publicMessage: 'El parqueadero asignado esta inactivo.',
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await createSession({
      userId: user.id,
      role: user.role,
      parkingLotId: user.parkingLotId,
      parkingLotSlug: user.parkingLot?.slug ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    resetRateLimit(`login:${ctx.ip ?? 'desconocida'}`);

    await recordAudit({
      action: AuditAction.AUTH_LOGIN,
      actorId: user.id,
      parkingLotId: user.parkingLotId,
      ...ctx,
    });

    return NextResponse.json({
      ok: true,
      redirectTo: homePathForRole({
        role: user.role,
        parkingLot: user.parkingLot,
      }),
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    return toErrorResponse(error, 'auth/login');
  }
}
