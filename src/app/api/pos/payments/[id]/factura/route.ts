import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { getSiigoSettings } from '@/lib/parking/siigo';
import { buildInvoicePrint } from '@/lib/billing/invoice-print';
import { consumeRateLimit } from '@/lib/rate-limit';
import { chooseInvoiceTarget } from '@/lib/billing/invoice-choice';
import { customerInputSchema } from '@/lib/payments/customer-schema';
import { serializePayment } from '@/lib/payments/serialize';

/**
 * La factura de un pago, para imprimirla en el kiosco.
 *
 * Solo lee: la factura la emite `queueInvoice` cuando el cliente elige a nombre de
 * quien va (POST, abajo). La pantalla de resultado pregunta aqui cada dos segundos
 * hasta que este lista (ver `buildInvoicePrint` para los tres estados).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    // La pantalla pregunta cada 2 s durante 30 s como mucho.
    await consumeRateLimit({ key: `factura-pos:${user.id}`, limit: 90, windowMs: 60_000 });
    const { id } = await params;

    const payment = await db.payment.findUnique({
      where: { id },
      include: { invoice: true, parkingLot: true, customer: true },
    });
    if (!payment) throw new AppError('NOT_FOUND');

    // El pago tiene que ser del parqueadero de quien pregunta.
    scopeToParkingLot(user, payment.parkingLotId);

    if (payment.status !== 'APPROVED') {
      return NextResponse.json({ status: 'UNAVAILABLE', document: null });
    }

    const settings = await getSiigoSettings(payment.parkingLotId);
    return NextResponse.json(buildInvoicePrint(payment, settings.itemDescription));
  } catch (error) {
    return toErrorResponse(error, 'pos/payments/[id]/factura');
  }
}

const choiceSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('CONSUMIDOR_FINAL') }),
  z.object({ tipo: z.literal('A_MI_NOMBRE'), customer: customerInputSchema }),
]);

/**
 * El cliente elige, despues de pagar, como quiere su factura: a su nombre o a
 * consumidor final. Aqui se emite (ver `invoice-choice.ts`). Responde el pago
 * actualizado, que es lo que la pantalla de resultado muestra e imprime.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    await consumeRateLimit({ key: `factura-elegir:${user.id}`, limit: 20, windowMs: 60_000 });
    const { id } = await params;

    const parsed = choiceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError('VALIDATION', {
        publicMessage:
          parsed.error.issues.find((issue) => issue.path.includes('email'))?.message ??
          'Revisa los datos de la factura.',
      });
    }

    const choice = parsed.data;
    const payment = await chooseInvoiceTarget({
      user,
      paymentId: id,
      choice:
        choice.tipo === 'A_MI_NOMBRE'
          ? {
              tipo: 'A_MI_NOMBRE',
              customer: { ...choice.customer, email: choice.customer.email || null },
            }
          : choice,
    });
    return NextResponse.json(serializePayment(payment));
  } catch (error) {
    return toErrorResponse(error, 'pos/payments/[id]/factura');
  }
}
