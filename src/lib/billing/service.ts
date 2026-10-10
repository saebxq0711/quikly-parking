import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { AuditAction, recordAudit } from '../audit';
import { AppError, scrubSecrets } from '../errors';
import { getSiigoSettings, isSiigoEnabled, siigoClientFor } from '../parking/siigo';
import {
  buildInvoicePayload,
  findMissingSettings,
} from '@/integrations/siigo/invoice-payload';
import { describeSiigoErrors } from '@/integrations/siigo/errors';

/**
 * Facturacion electronica (CLAUDE.md secciones 14 y 15, FASE 7).
 *
 * PRINCIPIO: la factura NUNCA invalida el cobro. Si SIIGO falla, esta caido, o
 * la configuracion esta incompleta, el pago sigue siendo APROBADO y la factura
 * queda registrada como PENDING/FAILED con el motivo. El dinero ya se cobro:
 * fingir que el pago no ocurrio porque la factura fallo seria peor.
 */

const MAX_ATTEMPTS = 5;

/**
 * Saca el motivo legible del cuerpo de error de SIIGO.
 *
 * Guardar solo "la factura fue rechazada" obligaba a ir al log del servidor para
 * saber que campo estaba mal; con esto el motivo queda en la propia factura, en
 * espanol, y se ve desde la interfaz.
 */
function extractSiigoError(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  return describeSiigoErrors((detail as { body?: unknown }).body);
}

/**
 * Registra la intencion de facturar e intenta enviarla.
 * Se llama cuando el cliente elige en el kiosco a nombre de quien va la factura
 * (`invoice-choice.ts`), o al rescatar un pago sin eleccion. Es seguro llamarla
 * mas de una vez: la factura es unica por pago.
 */
export async function queueInvoice(paymentId: string): Promise<void> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { parkingLot: true, invoice: true },
  });

  if (!payment) return;
  if (payment.status !== 'APPROVED') return;
  // Ya facturada correctamente: no se vuelve a enviar.
  if (payment.invoice && ['SENT', 'ACCEPTED'].includes(payment.invoice.status)) {
    return;
  }

  const invoice =
    payment.invoice ??
    (await db.invoice.create({
      data: { paymentId: payment.id, status: 'PENDING' },
    }));

  await recordAudit({
    action: AuditAction.INVOICE_REQUESTED,
    parkingLotId: payment.parkingLotId,
    entity: 'Invoice',
    entityId: invoice.id,
    metadata: { paymentId: payment.id },
  });

  if (!(await isSiigoEnabled(payment.parkingLotId))) {
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PENDING',
        lastError:
          'La facturacion esta desactivada para este parqueadero.',
        lastAttempt: new Date(),
      },
    });
    return;
  }

  const settings = await getSiigoSettings(payment.parkingLotId);
  const missing = findMissingSettings(settings);

  if (missing.length > 0) {
    // No se envia una factura con valores adivinados (CLAUDE.md seccion 37).
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PENDING',
        lastError: `Configuracion de SIIGO incompleta. Falta: ${missing.join(', ')}.`,
        lastAttempt: new Date(),
      },
    });
    return;
  }

  if (invoice.attempts >= MAX_ATTEMPTS) {
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'FAILED',
        lastError: `Se agotaron los ${MAX_ATTEMPTS} intentos de facturacion.`,
      },
    });
    return;
  }

  const payload = buildInvoicePayload(payment, settings, payment.parkingLot);

  try {
    const client = await siigoClientFor(payment.parkingLotId);
    const result = await client.createInvoice(payload);

    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'SENT',
        siigoInvoiceId: result.id,
        number: result.number,
        cufe: result.cufe,
        publicUrl: result.publicUrl,
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        lastError: null,
        requestPayload: scrubSecrets(payload) as Prisma.InputJsonValue,
        responsePayload: scrubSecrets(result.raw) as Prisma.InputJsonValue,
      },
    });

    await recordAudit({
      action: AuditAction.INVOICE_RESULT,
      parkingLotId: payment.parkingLotId,
      entity: 'Invoice',
      entityId: invoice.id,
      metadata: { status: 'SENT', number: result.number },
    });
  } catch (error) {
    // El motivo real lo trae `detail`, no el mensaje publico. Sin volcarlo
    // completo, en el log solo queda "la factura fue rechazada", que no dice
    // que campo hay que corregir.
    const detail =
      error instanceof AppError ? error.detail : undefined;
    const reason =
      extractSiigoError(detail) ??
      (error instanceof Error ? error.message : 'Error desconocido al facturar.');
    const message = reason;

    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: invoice.attempts + 1 >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        lastError: message.slice(0, 500),
        requestPayload: scrubSecrets(payload) as Prisma.InputJsonValue,
      },
    });

    await recordAudit({
      action: AuditAction.INVOICE_RESULT,
      parkingLotId: payment.parkingLotId,
      entity: 'Invoice',
      entityId: invoice.id,
      metadata: { status: 'FAILED' },
    });

    console.error('[billing] fallo al crear la factura', {
      paymentId,
      motivo: reason,
      detalle: JSON.stringify(detail),
    });
  }
}

/**
 * Tiempo que se espera a que el cliente elija en el kiosco como quiere su factura
 * (a su nombre o a consumidor final). Pasado esto, se emite sin el.
 */
export const ELECCION_FACTURA_MS = 10 * 60_000;

/**
 * Hasta donde se mira atras al rescatar. Un pago aprobado sin factura de hace mas
 * de una semana no es un cliente que se fue: es algo raro que debe revisar una
 * persona, no emitirse solo con fecha vieja.
 */
const RESCATE_MAX_MS = 7 * 24 * 60 * 60_000;

/**
 * Factura los pagos aprobados cuyo cliente no eligio como la queria.
 *
 * Despues de pagar, el kiosco pregunta "a mi nombre o consumidor final" y la
 * factura sale al elegir. Si el cliente se va, el kiosco elige consumidor final
 * solo tras un minuto sin tocar la pantalla; esto cubre lo que el kiosco no pudo
 * hacer (se recargo, se apago, perdio la red). La factura sale con lo que el pago
 * ya tenga: los datos del tiquete si el parqueadero los conoce, o consumidor final.
 *
 * Seguro ante carreras: la factura es unica por pago, asi que si el cliente elige
 * justo a la vez, solo una de las dos crea la fila.
 */
export async function invoiceAbandonedPayments(limit = 20): Promise<number> {
  const ahora = Date.now();
  const pagos = await db.payment.findMany({
    where: {
      status: 'APPROVED',
      invoice: { is: null },
      resolvedAt: {
        lt: new Date(ahora - ELECCION_FACTURA_MS),
        gt: new Date(ahora - RESCATE_MAX_MS),
      },
    },
    orderBy: { resolvedAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  for (const pago of pagos) {
    await queueInvoice(pago.id).catch((error) =>
      console.error('[billing] no se pudo facturar un pago sin eleccion', {
        paymentId: pago.id,
        error,
      }),
    );
  }
  return pagos.length;
}

/**
 * Reintenta las facturas pendientes. Pensado para una tarea programada
 * (cron / GET /api/cron/invoices) una vez SIIGO este configurado.
 */
export async function retryPendingInvoices(limit = 20): Promise<number> {
  const pending = await db.invoice.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { paymentId: true },
  });

  for (const invoice of pending) {
    await queueInvoice(invoice.paymentId);
  }
  return pending.length;
}
