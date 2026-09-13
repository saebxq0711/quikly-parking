import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';
import { env } from '../env';

/**
 * Firma y verificacion del token de sesion. SIN acceso a base de datos.
 *
 * Vive separado de `session.ts` a proposito: el middleware corre en el Edge
 * Runtime, y si importara el modulo que trae Prisma, arrastraria el motor de
 * base de datos a un entorno donde no funciona (Next avisa con
 * "A Node.js API is used ... not supported in the Edge Runtime") y ademas
 * infla el bundle del middleware, que se evalua en CADA peticion.
 *
 * Aqui solo se comprueba que la firma sea valida. Que la sesion siga viva, que
 * el usuario siga activo y que rol tiene se resuelve contra la base de datos en
 * `guards.ts`, del lado del servidor.
 */

export const SESSION_COOKIE_NAME = 'pdp_session';

const secretKey = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionClaims {
  userId: string;
  sessionId: string;
  role: Role;
  parkingLotId: string | null;
  /**
   * Identificador legible del parqueadero. Viaja en el token para que el
   * middleware pueda mandar a cada rol a su propia area sin consultar la base
   * de datos, que no puede hacer en el Edge Runtime.
   */
  parkingLotSlug: string | null;
}

export async function signSessionToken(params: {
  userId: string;
  sessionId: string;
  role: Role;
  parkingLotId: string | null;
  parkingLotSlug: string | null;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({
    role: params.role,
    parkingLotId: params.parkingLotId,
    parkingLotSlug: params.parkingLotSlug,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.userId)
    .setJti(params.sessionId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(params.expiresAt.getTime() / 1000))
    .sign(secretKey);
}

/** Verifica la firma del JWT. Devuelve null si no es valido o expiro. */
export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });
    if (!payload.sub || !payload.jti) return null;
    return {
      userId: payload.sub,
      sessionId: payload.jti,
      role: payload.role as Role,
      parkingLotId: (payload.parkingLotId as string | null) ?? null,
      parkingLotSlug: (payload.parkingLotSlug as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
