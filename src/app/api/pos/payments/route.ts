import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { findLivePayment, startCardPayment } from '@/lib/payments/service';
import { getPaymentPoint } from '@/lib/parking/payment-point';
import { saveCustomer } from '@/lib/payments/customers';
import { serializePayment } from '@/lib/payments/serialize';
import { customerInputSchema } from '@/lib/payments/customer-schema';

const schema = z.object({
  vehicleType: z.enum(['CAR', 'MOTORCYCLE', 'BICYCLE', 'SCOOTER']),
  // Hasta 200: el QR puede traer el enlace completo (`https://.../t/Z1M14`). Que sea
  // valido lo decide `recognizeSearchTerm`, no el largo.
  identifier: z.string().min(1).max(200),
  ticketId: z.string().min(1).max(64),
  /**
   * Clave de idempotencia generada por el cliente (crypto.randomUUID).
   * Es lo que impide que un doble clic o un reintento generen dos cobros.
   */
  idempotencyKey: z.string().uuid(),

  /**
   * Total que el cliente vio en pantalla. No decide cuanto se cobra —eso lo dice el
   * sistema del parqueadero—, solo evita cobrar un valor distinto del que acepto.
   */
  expectedAmount: z.number().int().positive().optional(),

  /**
   * Cliente que paga. El kiosco ya no lo manda aqui: la factura se elige despues de
   * pagar (`/api/pos/payments/[id]/factura`). Se sigue aceptando por compatibilidad.
   */
  customer: customerInputSchema.optional(),
});

/** Inicia un cobro con tarjeta contra el datafono. */
export async function POST(request: Request) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    await consumeRateLimit({ key: `pay:${user.id}`, limit: 20, windowMs: 60_000 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage: 'La solicitud de cobro no es valida.',
        detail: parsed.error.issues,
      });
    }

    const parkingLotId = scopeToParkingLot(user);
    const paymentPoint = await getPaymentPoint(user, parkingLotId);

    // Se registra antes de cobrar: si el cobro se aprueba, la factura ya tiene
    // a quien emitirse sin depender de otra pantalla.
    const customer = parsed.data.customer
      ? await saveCustomer({
          parkingLotId,
          input: {
            identification: parsed.data.customer.identification,
            firstName: parsed.data.customer.firstName,
            lastName: parsed.data.customer.lastName ?? '',
            phone: parsed.data.customer.phone,
            email: parsed.data.customer.email || null,
          },
        })
      : null;

    // El monto NO viaja en la peticion: lo revalida el servicio contra el
    // sistema del parqueadero justo antes de cobrar.
    const payment = await startCardPayment({
      user,
      parkingLotId,
      paymentPoint,
      customer,
      vehicleType: parsed.data.vehicleType,
      identifier: parsed.data.identifier,
      ticketId: parsed.data.ticketId,
      idempotencyKey: parsed.data.idempotencyKey,
      expectedAmount: parsed.data.expectedAmount,
    });

    return NextResponse.json(serializePayment(payment), { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 'pos/payments');
  }
}

/**
 * Cobro vivo del punto de pago, si lo hay.
 *
 * La pantalla lo consulta al cargar para retomar una operacion en curso: si el
 * navegador se recarga o alguien sale y vuelve, el cliente no puede quedarse
 * con la tarjeta pasada y la pantalla en blanco.
 */
export async function GET() {
  try {
    const user = await requireRole('PUNTO_PAGO');
    await consumeRateLimit({ key: `pago-vivo:${user.id}`, limit: 30, windowMs: 60_000 });
    const parkingLotId = scopeToParkingLot(user);
    const point = await getPaymentPoint(user, parkingLotId);

    const live = await findLivePayment(parkingLotId, point.id);
    return NextResponse.json(live ? serializePayment(live) : null);
  } catch (error) {
    return toErrorResponse(error, 'pos/payments/live');
  }
}
