import { Prisma, type Payment } from '@prisma/client';
import { db } from '../db';
import { AppError } from '../errors';
import { enSegundoPlano } from '../background';
import type { CurrentUser } from '../auth/guards';
import { scopeToParkingLot } from '../auth/guards';
import { saveCustomer, type CustomerInput } from '../payments/customers';
import { sendReceiptEmail } from '../payments/receipt-email';
import { queueInvoice } from './service';

/**
 * A nombre de quien va la factura, elegido por el cliente DESPUES de pagar.
 *
 * El kiosco cobra primero y luego pregunta: "a mi nombre" (documento, nombre,
 * correo) o "consumidor final" (sin datos). Asi nadie llena un formulario para un
 * cobro que despues no pasa, y quien no necesita factura propia sale mas rapido.
 *
 * La factura se emite aqui, al elegir; antes no existe. Si el cliente se va sin
 * elegir, el kiosco elige consumidor final tras un minuto quieto, y si ni eso
 * ocurre (se recargo, se apago), `invoiceAbandonedPayments` la emite a los diez.
 */
export type InvoiceChoice =
  | { tipo: 'CONSUMIDOR_FINAL' }
  | { tipo: 'A_MI_NOMBRE'; customer: CustomerInput };

export async function chooseInvoiceTarget(params: {
  user: CurrentUser;
  paymentId: string;
  choice: InvoiceChoice;
}): Promise<Payment> {
  const { user, paymentId, choice } = params;

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { id: true } } },
  });
  if (!payment) throw new AppError('NOT_FOUND');
  // El pago tiene que ser del parqueadero del kiosco, y de ESTE kiosco.
  scopeToParkingLot(user, payment.parkingLotId);
  if (user.paymentPointId && payment.paymentPointId !== user.paymentPointId) {
    throw new AppError('NOT_FOUND');
  }

  if (payment.status !== 'APPROVED') {
    throw new AppError('CONFLICT', {
      publicMessage: 'Este pago no quedo aprobado: no hay factura que emitir.',
    });
  }

  // Ya se eligio (un doble toque, un reintento de red, o el rescate de los diez
  // minutos): no se cambia una factura en camino. Se devuelve el pago como esta.
  if (payment.invoice) return payment;

  const cliente =
    choice.tipo === 'A_MI_NOMBRE'
      ? await saveCustomer({ parkingLotId: payment.parkingLotId, input: choice.customer })
      : null;

  /*
    Los datos del pago son el soporte de la factura (`buildInvoicePayload` los lee).
    Consumidor final los deja vacios a proposito: si el tiquete traia un nombre del
    parqueadero, el cliente acaba de decir que no quiere la factura a nombre de nadie.

    La fila de la factura se crea en la misma transaccion: es la marca de "ya se
    eligio". Si el rescate la creo un instante antes, la restriccion unica hace
    fallar esta y gana la primera.
  */
  try {
    await db.$transaction([
      db.invoice.create({ data: { paymentId: payment.id, status: 'PENDING' } }),
      db.payment.update({
        where: { id: payment.id },
        data: cliente
          ? {
              customerId: cliente.id,
              customerName: [cliente.firstName, cliente.lastName].filter(Boolean).join(' '),
              customerDocument: cliente.identification,
            }
          : { customerId: null, customerName: null, customerDocument: null },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }
    throw error;
  }

  enSegundoPlano(() =>
    queueInvoice(payment.id).catch((error) =>
      console.error('[billing] fallo al emitir la factura elegida', { paymentId, error }),
    ),
  );
  // El comprobante al correo: solo existe si eligio "a mi nombre" y tiene correo.
  if (cliente?.email) {
    enSegundoPlano(() =>
      sendReceiptEmail(payment.id).catch((error) =>
        console.error('[billing] no se pudo enviar el comprobante', { paymentId, error }),
      ),
    );
  }

  return db.payment.findUniqueOrThrow({ where: { id: payment.id } });
}
