import { cache } from 'react';
import type { Role } from '@prisma/client';
import { db } from '../db';
import { AppError } from '../errors';
import { readSessionCookie } from './session';

/**
 * Guardas de autenticacion y autorizacion. TODA decision de permisos pasa por
 * aqui, del lado del servidor (CLAUDE.md secciones 10, 11 y 18).
 *
 * El aislamiento entre parqueaderos se resuelve en `scopeToParkingLot`: un
 * ADMIN_PARQUEADERO no puede leer datos de otro parqueadero aunque manipule el
 * parametro de la peticion, porque el id de su parqueadero se toma de la base
 * de datos y no de la entrada del usuario.
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  parkingLotId: string | null;
  paymentPointId: string | null;
  mustChangePassword: boolean;
  parkingLot: {
    id: string;
    slug: string;
    name: string;
    novaBaseUrl: string | null;
  } | null;
  paymentPoint: {
    id: string;
    name: string;
    code: string;
    terminalCode: string | null;
    cashierCode: string | null;
    boxNumber: string | null;
  } | null;
}

/**
 * Usuario de la peticion actual, o null.
 * `cache` evita repetir la consulta cuando varios componentes la piden en el
 * mismo render.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await readSessionCookie();
  if (!claims) return null;

  // La sesion debe seguir viva en base de datos: permite revocarla al instante.
  const session = await db.session.findUnique({
    where: { id: claims.sessionId },
    select: { userId: true, revokedAt: true, expiresAt: true },
  });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt < new Date() ||
    session.userId !== claims.userId
  ) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      parkingLotId: true,
      paymentPointId: true,
      mustChangePassword: true,
      parkingLot: {
        select: { id: true, slug: true, name: true, novaBaseUrl: true },
      },
      paymentPoint: {
        select: {
          id: true,
          name: true,
          code: true,
          terminalCode: true,
          cashierCode: true,
          boxNumber: true,
        },
      },
    },
  });

  if (!user || !user.active) return null;

  const { active: _active, ...rest } = user;
  return rest as CurrentUser;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError('UNAUTHENTICATED');
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AppError('FORBIDDEN', {
      detail: { required: roles, actual: user.role, userId: user.id },
    });
  }
  return user;
}

/**
 * Devuelve el id del parqueadero sobre el que el usuario puede operar.
 *
 * - SUPERADMIN: puede apuntar a cualquier parqueadero, pero debe indicar cual.
 * - ADMIN_PARQUEADERO y PUNTO_PAGO: siempre el suyo. Si piden otro, es 403 —
 *   este es el control que impide que el admin del Parqueadero A lea datos del
 *   Parqueadero B cambiando un parametro de la URL.
 */
export function scopeToParkingLot(
  user: CurrentUser,
  requestedParkingLotId?: string | null,
): string {
  if (user.role === 'SUPERADMIN') {
    const target = requestedParkingLotId ?? user.parkingLotId;
    if (!target) {
      throw new AppError('VALIDATION', {
        publicMessage: 'Selecciona un parqueadero para continuar.',
      });
    }
    return target;
  }

  if (!user.parkingLotId) {
    throw new AppError('FORBIDDEN', {
      publicMessage: 'Tu usuario no tiene un parqueadero asignado.',
      detail: { userId: user.id, role: user.role },
    });
  }

  if (requestedParkingLotId && requestedParkingLotId !== user.parkingLotId) {
    throw new AppError('FORBIDDEN', {
      detail: {
        reason: 'intento de acceso a otro parqueadero',
        userId: user.id,
        own: user.parkingLotId,
        requested: requestedParkingLotId,
      },
    });
  }

  return user.parkingLotId;
}

/** Ruta inicial de cada rol despues del login. */
export function homePathForRole(user: {
  role: Role;
  parkingLot: { slug: string } | null;
}): string {
  switch (user.role) {
    case 'SUPERADMIN':
      return '/admin/parqueaderos';
    case 'ADMIN_PARQUEADERO':
      // El Resumen: el parqueadero en este momento. Los pagos del kiosco son
      // una parte del movimiento, no lo primero que alguien quiere ver al
      // entrar.
      return user.parkingLot ? `/p/${user.parkingLot.slug}` : '/sin-parqueadero';
    case 'PUNTO_PAGO':
      // El punto de pago vive dentro del parqueadero: cada sitio tiene su
      // propio sistema, sus propias cajas y su propio datafono.
      return user.parkingLot ? `/p/${user.parkingLot.slug}/pos` : '/sin-parqueadero';
  }
}
