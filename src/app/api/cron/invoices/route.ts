import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { retryPendingInvoices } from '@/lib/billing/service';
import { retryParkingConfirmations } from '@/lib/payments/service';

export const maxDuration = 60;

/**
 * Reintento de facturas pendientes, para la tarea programada de Vercel (`vercel.json`).
 *
 * Una factura queda PENDING si SIIGO no respondio al aprobarse el pago. El cobro ya es
 * valido; esto la vuelve a enviar sin que nadie tenga que hacerlo a mano.
 *
 * Vercel Cron llama con `Authorization: Bearer <CRON_SECRET>`. Sin esa variable la ruta
 * no hace nada: no se puede disparar desde afuera.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const recibido = request.headers.get('authorization') ?? '';
  const esperado = `Bearer ${secret ?? ''}`;

  const valido =
    Boolean(secret) &&
    recibido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));

  if (!valido) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const reintentadas = await retryPendingInvoices();
  // Tambien los cobros aprobados que el parqueadero no alcanzo a registrar.
  const avisos = await retryParkingConfirmations();
  return NextResponse.json({ reintentadas, avisos });
}
