import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { lookupVehicle } from '@/lib/payments/service';
import { getPaymentPoint } from '@/lib/parking/payment-point';

const schema = z.object({
  vehicleType: z.enum(['CAR', 'MOTORCYCLE', 'BICYCLE', 'SCOOTER']),
  identifier: z.string().min(1).max(20),
});

/**
 * Consulta de vehiculo y valor a cobrar.
 *
 * El parqueadero NO se toma de la peticion: se deriva del usuario autenticado,
 * asi que un operador no puede consultar vehiculos de otro sitio cambiando un
 * parametro (CLAUDE.md seccion 18).
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole('PUNTO_PAGO');

    consumeRateLimit({ key: `lookup:${user.id}`, limit: 40, windowMs: 60_000 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage: 'Revisa el identificador ingresado.',
      });
    }

    const parkingLotId = scopeToParkingLot(user);
    // Confirma que el usuario tenga un punto de pago valido antes de consultar.
    await getPaymentPoint(user, parkingLotId);

    const result = await lookupVehicle({
      user,
      parkingLotId,
      vehicleType: parsed.data.vehicleType,
      identifier: parsed.data.identifier,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, 'pos/lookup');
  }
}
