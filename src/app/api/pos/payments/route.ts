import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { findLivePayment, startCardPayment } from '@/lib/payments/service';
import { getPaymentPoint } from '@/lib/parking/payment-point';
import { saveCustomer } from '@/lib/payments/customers';
import { serializePayment } from '@/lib/payments/serialize';

const schema = z.object({
  vehicleType: z.enum(['CAR', 'MOTORCYCLE', 'BICYCLE', 'SCOOTER']),
  identifier: z.string().min(1).max(20),
  ticketId: z.string().min(1).max(64),
  /**
   * Clave de idempotencia generada por el cliente (crypto.randomUUID).
   * Es lo que impide que un doble clic o un reintento generen dos cobros.
   */
  idempotencyKey: z.string().uuid(),

  /**
   * Cliente que paga, identificado en el kiosco por su documento.
   * Es lo que permite emitir la factura a su nombre en vez de a consumidor
   * final.
   */
  customer: z
    .object({
      identification: z.string().min(1).max(20),
      firstName: z.string().min(1).max(80),
      lastName: z.string().max(80).optional().default(''),
      phone: z.string().max(30).optional(),
      /**
       * Obligatorio: es a donde SIIGO envia la factura electronica. Sin correo la
       * factura se emite, pero el cliente nunca la recibe.
       */
      email: z
        .string()
        .trim()
        .max(120)
        .email('Escribe un correo valido: ahi te enviamos la factura electronica.'),
    })
    .optional(),
});

/** Inicia un cobro con tarjeta contra el datafono. */
export async function POST(request: Request) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    consumeRateLimit({ key: `pay:${user.id}`, limit: 20, windowMs: 60_000 });

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
    const parkingLotId = scopeToParkingLot(user);
    const point = await getPaymentPoint(user, parkingLotId);

    const live = await findLivePayment(parkingLotId, point.id);
    return NextResponse.json(live ? serializePayment(live) : null);
  } catch (error) {
    return toErrorResponse(error, 'pos/payments/live');
  }
}
