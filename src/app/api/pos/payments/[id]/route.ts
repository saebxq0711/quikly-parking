import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { refreshPaymentStatus } from '@/lib/payments/service';
import { serializePayment } from '@/lib/payments/serialize';
import { consumeRateLimit } from '@/lib/rate-limit';

/**
 * Sondeo del estado del cobro.
 *
 * El manual de SIPConnector (Anexo 3) pide que la iteracion NO sea inferior a
 * tres segundos; la interfaz consulta cada 3 s (20 por minuto). El limite de 90
 * por minuto deja holgura para dos pestañas y corta un bucle desbocado, que si
 * no golpearia la red de pagos por cada consulta.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    await consumeRateLimit({ key: `estado-pago:${user.id}`, limit: 90, windowMs: 60_000 });
    const { id } = await params;

    const existing = await db.payment.findUnique({
      where: { id },
      select: { parkingLotId: true },
    });
    if (!existing) throw new AppError('NOT_FOUND');

    // Confirma que el pago pertenece al parqueadero del usuario.
    scopeToParkingLot(user, existing.parkingLotId);

    const payment = await refreshPaymentStatus(id);
    return NextResponse.json(serializePayment(payment));
  } catch (error) {
    return toErrorResponse(error, 'pos/payments/[id]');
  }
}
