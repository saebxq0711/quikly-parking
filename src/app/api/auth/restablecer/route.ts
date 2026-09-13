import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { AuditAction, recordAudit, requestContext } from '@/lib/audit';
import { hashToken } from '@/lib/auth/reset-token';
import { hashPassword } from '@/lib/auth/password';

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(10, 'La contrasena debe tener al menos 10 caracteres.')
    .max(200),
});

/**
 * Fija la nueva contrasena a partir del enlace del correo.
 *
 * Reglas que importan aqui:
 *
 *  - El token se busca por su HASH; el original nunca se guardo.
 *  - Se marca usado DESPUES de cambiar la clave, no antes: si el cambio falla,
 *    el enlace sigue sirviendo y el usuario no queda encerrado afuera.
 *  - Se cierran TODAS las sesiones del usuario. Si pidio restablecer porque
 *    alguien le entro a la cuenta, dejar viva la sesion del intruso haria inutil
 *    el cambio.
 */
export async function POST(request: Request) {
  const ctx = requestContext(request);

  try {
    consumeRateLimit({
      key: `restablecer:${ctx.ip ?? 'desconocida'}`,
      limit: 10,
      windowMs: 10 * 60_000,
    });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage:
          parsed.error.issues[0]?.message ?? 'Revisa los datos enviados.',
      });
    }

    const solicitud = await db.passwordResetRequest.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    const vigente =
      solicitud &&
      solicitud.userId &&
      !solicitud.usedAt &&
      solicitud.expiresAt &&
      solicitud.expiresAt > new Date();

    if (!vigente) {
      // Un solo mensaje para "no existe", "ya se uso" y "vencio": los tres
      // significan lo mismo para quien lo tiene delante, y separarlos le diria a
      // un atacante si acerto con un token.
      throw new AppError('VALIDATION', {
        publicMessage:
          'Este enlace ya no sirve. Solicita uno nuevo desde "Olvide mi contrasena".',
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    await db.$transaction([
      db.user.update({
        where: { id: solicitud.userId! },
        data: { passwordHash },
      }),
      db.passwordResetRequest.update({
        where: { id: solicitud.id },
        data: { usedAt: new Date(), resolvedAt: new Date() },
      }),
      // Fuera todas las sesiones abiertas, incluida la de quien haya entrado.
      db.session.deleteMany({ where: { userId: solicitud.userId! } }),
    ]);

    await recordAudit({
      action: AuditAction.USER_PASSWORD_CHANGED,
      actorId: solicitud.userId,
      entity: 'User',
      entityId: solicitud.userId!,
      metadata: { via: 'enlace-por-correo', ip: ctx.ip },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, 'auth/restablecer');
  }
}
