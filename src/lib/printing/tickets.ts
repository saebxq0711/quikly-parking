import type { InvoiceDocumentDTO } from '@/lib/billing/invoice-print';
import type { PaymentDTO } from '@/lib/payments/serialize';
import { EscPos } from './escpos';
import {
  comprobante,
  factura,
  fechaHora,
  type ReceiptDocument,
  type ReceiptIssuer,
} from './receipt-data';

/**
 * Los papeles del kiosco en ESC/POS: la factura de SIIGO, el comprobante de respaldo y
 * la hoja de prueba. El contenido sale de `receipt-data.ts`, el mismo que pinta la
 * version del navegador (`receipt.tsx`); esta es la que sale por USB directo.
 */

function imprimir(doc: ReceiptDocument): Uint8Array {
  const t = new EscPos().iniciar().alinear('centro');

  t.negrita(true).tamano(1, 2).parrafo(doc.title).tamano(1, 1).negrita(false);
  for (const linea of doc.headerLines) t.parrafo(linea);

  t.separador().negrita(true).linea(doc.heading.toUpperCase());
  if (doc.number) t.tamano(1, 2).linea(doc.number).tamano(1, 1);
  t.negrita(false).linea(doc.issuedAt).alinear('izquierda');

  for (const seccion of doc.sections) {
    t.separador().negrita(true).linea(seccion.title.toUpperCase()).negrita(false);
    for (const fila of seccion.rows) t.fila(fila.label, fila.value);
  }

  if (doc.items.length > 0) {
    t.separador();
    for (const item of doc.items) t.parrafo(item.description).fila(item.detail, item.total);
  }

  t.separador();
  for (const fila of doc.totals) t.fila(fila.label, fila.value);
  t.negrita(true).tamano(1, 2).fila('TOTAL', doc.total).tamano(1, 1).negrita(false);

  if (doc.cufe) t.separador().negrita(true).linea('CUFE').negrita(false).parrafo(doc.cufe);

  t.alinear('centro');
  if (doc.qrUrl) {
    t.linea().qr(doc.qrUrl);
    if (doc.qrCaption) t.linea(doc.qrCaption);
  }
  for (const nota of doc.notes) t.parrafo(nota);

  return t.avanzar(3).cortar().bytesFinales();
}

export function facturaEscPos(documento: InvoiceDocumentDTO, pago: PaymentDTO): Uint8Array {
  return imprimir(factura(documento, pago));
}

export function comprobanteEscPos(pago: PaymentDTO, emisor: ReceiptIssuer): Uint8Array {
  return imprimir(comprobante(pago, emisor));
}

/**
 * Comprobante de PRUEBA para la pantalla de configuracion de la impresora.
 *
 * Es el mismo papel que recibe un cliente, con los datos reales del parqueadero (asi se
 * revisa que el encabezado salga completo) y una venta inventada: cliente, tiquete,
 * tiempo, tarjeta y total de ejemplo. Va marcado como prueba arriba y abajo para que
 * nadie lo confunda con un pago real.
 */
export function comprobantePruebaEscPos(
  emisor: ReceiptIssuer,
  impresora: string,
  qrUrl: string | null,
): Uint8Array {
  const ahora = Date.now();
  const pago: PaymentDTO = {
    id: 'prueba',
    status: 'APPROVED',
    stage: 'RESOLVED',
    instruction: '',
    amount: 4500,
    plate: null,
    vehicleIdentifier: 'A7B48',
    vehicleType: 'MOTORCYCLE',
    ticketCode: 'A7B48',
    entryAt: new Date(ahora - 95 * 60_000).toISOString(),
    stayMinutes: 95,
    customerName: 'CLIENTE DE PRUEBA',
    customerDocument: '1000000000',
    reference: 'PRUEBA0001',
    receiptSeq: null,
    authorizationCode: '000000',
    receiptNumber: '000000',
    cardBrand: 'VISA',
    cardMask: '**** 0000',
    failureReason: null,
    parkingPending: false,
    isFinal: true,
    receiptUrl: qrUrl,
    createdAt: new Date(ahora).toISOString(),
    resolvedAt: new Date(ahora).toISOString(),
  };

  const doc = comprobante(pago, emisor);
  return imprimir({
    ...doc,
    heading: 'Comprobante de pago - PRUEBA',
    number: 'No. PRUEBA',
    qrCaption: qrUrl ? 'QR de prueba' : null,
    notes: [
      '*** DOCUMENTO DE PRUEBA ***',
      'No corresponde a un pago real ni sirve como soporte.',
      `Impresora: ${impresora} - ${fechaHora(new Date(ahora).toISOString())}`,
    ],
  });
}
