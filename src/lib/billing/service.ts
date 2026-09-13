import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { AuditAction, recordAudit } from '../audit';
import { AppError, scrubSecrets } from '../errors';
import { getSiigoSettings, isSiigoEnabled, siigoClientFor } from '../parking/siigo';
import {
  buildInvoicePayload,
  findMissingSettings,
} from '@/integrations/siigo/invoice-payload';

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
 * SIIGO responde `{ Status, Errors: [{ Code, Message, Params }] }`. Guardar
 * solo "la factura fue rechazada" obligaba a ir al log del servidor para saber
 * que campo estaba mal; con esto el motivo queda en la propia factura y se ve
 * desde la interfaz.
 */
function extractSiigoError(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const body = (detail as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null) return null;

  const errors = (body as { Errors?: unknown }).Errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((e: { Message?: string; Params?: string[] }) =>
        e.Params?.length ? `${e.Message} (${e.Params.join(', ')})` : e.Message,
      )
      .filter(Boolean)
      .join(' | ');
  }
  return null;
}

/**
 * Registra la intencion de facturar e intenta enviarla.
 * Se llama tras un pago aprobado. Es seguro llamarla mas de una vez: la factura
 * es unica por pago.
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
