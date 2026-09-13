import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { lookupCustomer } from '@/lib/payments/customers';

const schema = z.object({
  identification: z.string().min(1).max(20),
});

/**
 * Reconoce al cliente por su numero de documento.
 *
 * Si ya pago antes, el kiosco lo saluda por su nombre y no le vuelve a pedir
 * los datos. Si es la primera vez, se le piden una sola vez.
 *
 * Devuelve solo el nombre y los datos de contacto de ESE documento. No hay
 * forma de listar clientes ni de buscar por nombre: se responde a un documento
 * exacto o no se responde nada.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole('PUNTO_PAGO');

    // Un documento por intento, y con limite: sin esto la pantalla seria una
    // forma de comprobar que documentos existen en la base.
    consumeRateLimit({ key: `customer:${user.id}`, limit: 30, windowMs: 60_000 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage: 'El numero de documento no es valido.',
      });
    }

    const parkingLotId = scopeToParkingLot(user);
    const customer = await lookupCustomer({
      parkingLotId,
      identification: parsed.data.identification,
    });

    return NextResponse.json(customer);
  } catch (error) {
    return toErrorResponse(error, 'pos/customer');
  }
}
