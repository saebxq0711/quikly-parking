import { db } from '../db';
import { AppError } from '../errors';
import type { CurrentUser } from '../auth/guards';

/**
 * El punto de pago de un parqueadero.
 *
 * Cada parqueadero tiene UNO y solo uno. No es una simplificacion temporal: la
 * base de datos lo garantiza con un indice unico sobre `parkingLotId`, asi que
 * no depende de que ninguna pantalla se acuerde de comprobarlo.
 *
 * Aun asi el punto de pago es una entidad propia y no un campo del parqueadero,
 * porque lleva los datos que viajan al datafono (cajero y numero de caja) y es
 * a lo que se atribuye cada cobro en los reportes.
 */

export interface OperablePoint {
  id: string;
  name: string;
  code: string;
  cashierCode: string | null;
  boxNumber: string | null;
  /** Si hay impresora de recibos: decide si el kiosco imprime el comprobante. */
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

/**
 * Punto de pago del parqueadero, comprobando que el usuario pueda operarlo.
 *
 * Un usuario de punto de pago solo puede cobrar desde el suyo: si tuviera
 * asignado otro, la auditoria y el arqueo dejarian de significar algo.
 */
export async function getPaymentPoint(
  user: CurrentUser,
  parkingLotId: string,
): Promise<OperablePoint> {
  const point = await db.paymentPoint.findFirst({
    where: { parkingLotId, active: true },
    select: SELECT,
  });

  if (!point) {
    throw new AppError('NOT_FOUND', {
      publicMessage:
        'Este parqueadero no tiene un punto de pago activo. Avisa al administrador.',
      detail: { parkingLotId },
    });
  }

  if (
    user.role === 'PUNTO_PAGO' &&
    user.paymentPointId &&
    user.paymentPointId !== point.id
  ) {
    throw new AppError('FORBIDDEN', {
      publicMessage: 'Solo puedes cobrar desde el punto de pago que tienes asignado.',
      detail: { userId: user.id, asignado: user.paymentPointId, actual: point.id },
    });
  }

  return point;
}
