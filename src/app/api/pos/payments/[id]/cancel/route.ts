import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { cancelPayment } from '@/lib/payments/service';
import { serializePayment } from '@/lib/payments/serialize';
import { consumeRateLimit } from '@/lib/rate-limit';

/** Con los reintentos ante la nube de SIP (regla 7), una llamada puede pasar de 10 s. */
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    await consumeRateLimit({ key: `cancelar:${user.id}`, limit: 20, windowMs: 60_000 });
    const { id } = await params;

    const existing = await db.payment.findUnique({
      where: { id },
      select: { parkingLotId: true },
    });
    if (!existing) throw new AppError('NOT_FOUND');

    scopeToParkingLot(user, existing.parkingLotId);

    const payment = await cancelPayment(id, user);
    return NextResponse.json(serializePayment(payment));
  } catch (error) {
    return toErrorResponse(error, 'pos/payments/[id]/cancel');
  }
}
