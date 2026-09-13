import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { getSiigoSettings } from '@/lib/parking/siigo';
import { buildInvoicePrint } from '@/lib/billing/invoice-print';

/**
 * La factura de un pago, para imprimirla en el kiosco.
 *
 * Solo lee: la factura la emite `queueInvoice` al aprobarse el pago. La pantalla de
 * resultado pregunta aqui cada dos segundos hasta que este lista (ver
 * `buildInvoicePrint` para los tres estados).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('PUNTO_PAGO');
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
