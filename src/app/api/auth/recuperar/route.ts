import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestContext } from '@/lib/audit';
import { env } from '@/lib/env';
import { hashToken } from '@/lib/auth/reset-token';
import { mailConfigured, resetPasswordEmail, sendMail } from '@/lib/mail/resend';

const schema = z.object({ email: z.string().email().max(200) });

/**
 * Registra una solicitud de restablecimiento de contrasena.
 *
 * Responde SIEMPRE lo mismo, exista o no el correo. Confirmar si una cuenta
 * existe le regala a un atacante la mitad del trabajo: le dice que correos
 * probar.
 */
export async function POST(request: Request) {
  const ctx = requestContext(request);

  try {
    consumeRateLimit({
      key: `reset:${ctx.ip ?? 'desconocida'}`,
      limit: 5,
      windowMs: 10 * 60_000,
    });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage: 'Escribe un correo valido.',
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    /*
      Con correo configurado se manda un enlace y el usuario se resuelve solo.
      Sin correo, se registra la solicitud para que el super administrador la
      atienda a mano — que es como funcionaba antes, y sigue siendo la red de
      seguridad si Resend falla o si el sitio todavia no tiene dominio propio.

      El token solo se crea si el usuario EXISTE. Para el que no existe no se
      escribe nada y la respuesta es identica: quien prueba correos ajenos no
      puede distinguir un caso del otro, ni por la respuesta ni por el tiempo
      que tarda (el envio ocurre despues de responder, ver mas abajo).
    */
    let enviado = false;

    if (user && mailConfigured()) {
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + env.RESET_TOKEN_MINUTES * 60_000);

      // Invalida los enlaces anteriores del mismo usuario: si pidio dos, solo
      // el ultimo debe servir.
      await db.passwordResetRequest.updateMany({
        where: { userId: user.id, usedAt: null, resolvedAt: null },
        data: { usedAt: new Date() },
      });

      await db.passwordResetRequest.create({
        data: { email, userId: user.id, ip: ctx.ip, tokenHash, expiresAt },
      });

      enviado = await sendMail({
        to: email,
        subject: 'Restablece tu contrasena',
        html: resetPasswordEmail({
          link: `${env.APP_URL}/restablecer?token=${token}`,
          minutes: env.RESET_TOKEN_MINUTES,
          logoUrl: `${env.APP_URL}/quikly-parking.png`,
        }),
      });
    }

    if (!enviado) {
      // Una solicitud sin resolver por correo: pedirlo cinco veces no genera
      // cinco entradas que el administrador tenga que ir descartando.
      const pending = await db.passwordResetRequest.findFirst({
        where: { email, resolvedAt: null, tokenHash: null },
      });

      if (!pending) {
        await db.passwordResetRequest.create({
          data: { email, userId: user?.id ?? null, ip: ctx.ip },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, 'auth/recuperar');
  }
}
