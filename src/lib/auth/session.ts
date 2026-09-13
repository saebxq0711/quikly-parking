import { cookies } from 'next/headers';
import type { Role } from '@prisma/client';
import { db } from '../db';
import { env, isProduction } from '../env';
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifyToken,
  type SessionClaims,
} from './jwt';

/**
 * Sesiones con cookie httpOnly + JWT firmado, respaldadas por una fila en la
 * tabla `sessions`.
 *
 * Por que las dos cosas: el JWT permite validar la sesion sin tocar la base de
 * datos (lo hace el middleware, en el Edge), y la fila permite REVOCAR (logout,
 * desactivar un usuario, cambiar su rol) sin esperar a que expire el token. Un
 * JWT valido cuya fila no exista o este revocada no sirve.
 *
 * El rol viaja dentro del JWT solo como pista para el enrutamiento. Toda
 * decision de autorizacion sensible se toma leyendo el usuario real de la base
 * de datos (`getCurrentUser`) — el frontend nunca decide permisos por si mismo
 * (CLAUDE.md secciones 10 y 11).
 *
 * La firma vive en `jwt.ts`, sin acceso a base de datos, para que el middleware
 * pueda importarla sin arrastrar Prisma al Edge Runtime.
 */

export { SESSION_COOKIE_NAME, verifyToken };
export type { SessionClaims };

export async function createSession(params: {
  userId: string;
  role: Role;
  parkingLotId: string | null;
  parkingLotSlug: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_MINUTES * 60_000);

  const session = await db.session.create({
    data: {
      userId: params.userId,
      expiresAt,
      ip: params.ip ?? null,
      userAgent: params.userAgent?.slice(0, 300) ?? null,
    },
  });

  const token = await signSessionToken({
    userId: params.userId,
    sessionId: session.id,
    role: params.role,
    parkingLotId: params.parkingLotId,
    parkingLotSlug: params.parkingLotSlug,
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function readSessionCookie(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function destroySession(): Promise<void> {
  const claims = await readSessionCookie();
  if (claims) {
    // Revocar en base de datos, no solo borrar la cookie: si el token fue
    // copiado, deja de servir igual.
    await db.session
      .updateMany({
        where: { id: claims.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Revoca todas las sesiones de un usuario (cambio de rol, desactivacion). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
