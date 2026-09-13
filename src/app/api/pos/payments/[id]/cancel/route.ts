import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { cancelPayment } from '@/lib/payments/service';
import { serializePayment } from '@/lib/payments/serialize';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('PUNTO_PAGO');
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
