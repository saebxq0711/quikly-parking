'use client';

import type { InvoiceDocumentDTO } from '@/lib/billing/invoice-print';
import type { PaymentDTO } from '@/lib/payments/serialize';
import { factura } from '@/lib/printing/receipt-data';
import { PaperReceipt } from './receipt';

/**
 * La factura de SIIGO impresa en el kiosco por el navegador.
 *
 * Numero, items, impuestos y total salen de lo que SIIGO devolvio al emitirla; el
 * contenido completo (emisor, vehiculo, pago) lo arma `receipt-data.ts`, igual que en
 * la version por USB.
 */
export function InvoiceTicket({
  invoice,
  payment,
  onReady,
}: {
  invoice: InvoiceDocumentDTO;
  payment: PaymentDTO;
  onReady: () => void;
}) {
  return <PaperReceipt doc={factura(invoice, payment)} onReady={onReady} />;
}
