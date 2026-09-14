import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { mailConfigured, receiptEmail, sendMail } from '@/lib/mail/resend';
import { comprobante, emisorDe } from '@/lib/printing/receipt-data';
import { serializePayment } from './serialize';

/**
 * Comprobante de pago al correo del cliente.
 *
 * Es el mismo documento que imprime el kiosco (`receipt-data.ts`), asi que el cliente
 * tiene su soporte aunque el kiosco no tenga impresora. La factura electronica no va
 * aqui: la envia SIIGO por su lado cuando la emite.
 *
 * Una sola vez por pago. La marca `receiptEmailedAt` se toma de forma atomica ANTES de
 * enviar: el estado del pago se consulta cada dos segundos y dos consultas pueden ver
 * la aprobacion a la vez. Si Resend falla, la marca se devuelve.
 */
export async function sendReceiptEmail(paymentId: string): Promise<void> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true, parkingLot: true },
  });
  if (!payment || payment.status !== 'APPROVED') return;

  const to = payment.customer?.email;
  if (!to || !mailConfigured()) return;

  const claimed = await db.payment.updateMany({
    where: { id: paymentId, receiptEmailedAt: null },
    data: { receiptEmailedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const doc = comprobante(serializePayment(payment), emisorDe(payment.parkingLot));
  const sent = await sendMail({
    to,
    subject: `Comprobante de pago - ${payment.parkingLot.name}`,
    html: receiptEmail({ doc, logoUrl: `${env.APP_URL}/quikly-parking.png` }),
  });

  if (!sent) {
    await db.payment.update({ where: { id: paymentId }, data: { receiptEmailedAt: null } });
  }
}
