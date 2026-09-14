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

/** Hoja de prueba para comprobar la conexion desde la pantalla de configuracion. */
export function pruebaEscPos(parqueadero: string, impresora: string): Uint8Array {
  return new EscPos()
    .iniciar()
    .alinear('centro')
    .negrita(true)
    .tamano(2, 2)
    .linea('PRUEBA')
    .tamano(1, 1)
    .linea(parqueadero)
    .negrita(false)
    .linea(fechaHora(new Date().toISOString()))
    .separador()
    .alinear('izquierda')
    .fila('Impresora', impresora)
    .fila('Conexion', 'USB directo')
    .separador()
    .alinear('centro')
    .qr('A7B48')
    .linea('Si ves el QR, la impresora esta lista')
    .avanzar(3)
    .cortar()
    .bytesFinales();
}
