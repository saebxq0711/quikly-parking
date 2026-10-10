import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AuditAction, recordAudit } from '@/lib/audit';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { AppError, toErrorResponse } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  conectada: z.boolean(),
  /** Nombre que da el aparato ("DigitalPos ..."), para la auditoria. */
  nombre: z.string().max(120).optional(),
});

/**
 * El kiosco declara si tiene impresora, desde su pantalla de configuracion.
 *
 * Conectar la impresora en un kiosco es lo que dice que ESE kiosco imprime; quitarla,
 * que no. Asi un kiosco nuevo no queda "con impresora" por una casilla marcada al
 * crearlo. Solo toca el kiosco de la sesion: el id nunca viaja en la peticion.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    await consumeRateLimit({ key: `impresora:${user.id}`, limit: 10, windowMs: 60_000 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('VALIDATION');
    if (!user.paymentPointId) {
      throw new AppError('FORBIDDEN', { publicMessage: 'Este usuario no tiene un kiosco asignado.' });
    }

    const parkingLotId = scopeToParkingLot(user);
    const { count } = await db.paymentPoint.updateMany({
      where: { id: user.paymentPointId, parkingLotId },
      data: { hasPrinter: parsed.data.conectada },
    });
    if (count === 0) throw new AppError('NOT_FOUND');

    await recordAudit({
      action: AuditAction.PAYMENT_POINT_UPDATED,
      actorId: user.id,
      parkingLotId,
      entity: 'PaymentPoint',
      entityId: user.paymentPointId,
      metadata: {
        hasPrinter: parsed.data.conectada,
        impresora: parsed.data.nombre ?? null,
        desde: 'kiosco',
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, 'pos/impresora');
  }
}
