import { db } from '../db';
import { AppError } from '../errors';
import type { CurrentUser } from '../auth/guards';

/**
 * El kiosco de pago desde el que opera un usuario.
 *
 * Un parqueadero puede tener varios kioscos, cada uno con su datafono, su impresora y
 * su propio usuario. El kiosco se toma SIEMPRE del usuario de la sesion, nunca de la
 * peticion: asi nadie cobra con el datafono de otro kiosco.
 */

export interface OperablePoint {
  id: string;
  name: string;
  code: string;
  cashierCode: string | null;
  boxNumber: string | null;
  /** Si este kiosco usa impresora de recibos. */
  hasPrinter: boolean;
}

const SELECT = {
  id: true,
  name: true,
  code: true,
  cashierCode: true,
  boxNumber: true,
  hasPrinter: true,
} as const;

export async function getPaymentPoint(
  user: CurrentUser,
  parkingLotId: string,
): Promise<OperablePoint> {
  if (user.role !== 'PUNTO_PAGO' || !user.paymentPointId) {
    throw new AppError('FORBIDDEN', {
      publicMessage: 'Este usuario no tiene un kiosco de pago asignado.',
      detail: { userId: user.id },
    });
  }

  const point = await db.paymentPoint.findFirst({
    where: { id: user.paymentPointId, parkingLotId, active: true },
    select: SELECT,
  });

  if (!point) {
    throw new AppError('NOT_FOUND', {
      publicMessage: 'Este kiosco esta fuera de servicio. Avisa al administrador.',
      detail: { parkingLotId, paymentPointId: user.paymentPointId },
    });
  }

  return point;
}
