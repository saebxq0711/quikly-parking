import type { Customer, Invoice, ParkingLot, Payment } from '@prisma/client';

/**
 * La factura, lista para imprimirse en el kiosco.
 *
 * SIIGO la emite unos segundos despues de que el pago queda aprobado
 * (`queueInvoice`, en segundo plano). La pantalla de resultado pregunta aqui hasta
 * que este lista y entonces la imprime. Todo sale de lo que SIIGO devolvio al
 * crearla (`responsePayload`): numero, items, impuestos y total son los de la
 * factura real, no un calculo nuestro que podria no cuadrar con ella.
 *
 * Tres respuestas posibles:
 *   READY        la factura existe: se imprime.
 *   PENDING      se esta emitiendo: vuelve a preguntar en un momento.
 *   UNAVAILABLE  no va a estar lista a tiempo (facturacion desactivada, configuracion
 *                incompleta, SIIGO rechazo o no responde): se imprime el comprobante
 *                de pago con el QR a la factura, que llega despues al correo.
 */

export type InvoicePrintStatus = 'READY' | 'PENDING' | 'UNAVAILABLE';

export interface InvoiceLineDTO {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceTaxDTO {
  name: string;
  percentage: number | null;
  value: number;
}

export interface InvoiceDocumentDTO {
  issuerName: string;
  issuerNit: string | null;
  issuerAddress: string | null;
  issuerCity: string | null;
  /** "Factura electronica de venta" solo si la DIAN la valido (hay CUFE). */
  electronic: boolean;
  number: string;
  issuedAt: string;
  customerName: string;
  customerDocument: string | null;
  customerEmail: string | null;
  lines: InvoiceLineDTO[];
  taxes: InvoiceTaxDTO[];
  subtotal: number;
  total: number;
  paymentMethod: string | null;
  cufe: string | null;
}

export interface InvoicePrintDTO {
  status: InvoicePrintStatus;
  document: InvoiceDocumentDTO | null;
}

/** Si pasado este tiempo desde la aprobacion aun no hay factura, ya no llega a tiempo. */
const EMISION_MS = 45_000;

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

const NOT_READY: InvoicePrintDTO = { status: 'UNAVAILABLE', document: null };

export function buildInvoicePrint(
  payment: Payment & {
    invoice: Invoice | null;
    parkingLot: ParkingLot;
    customer: Customer | null;
  },
  itemDescription: string,
): InvoicePrintDTO {
  const invoice = payment.invoice;
  const approvedAt = (payment.resolvedAt ?? payment.createdAt).getTime();

  if (!invoice) {
    // `queueInvoice` crea la fila apenas se aprueba el pago: si aun no existe, va en camino.
    return Date.now() - approvedAt < EMISION_MS
      ? { status: 'PENDING', document: null }
      : NOT_READY;
  }

  const status = String(invoice.status);
  if (status === 'PENDING') {
    // Con motivo registrado ya no se va a emitir sola en estos segundos.
    if (invoice.lastError || Date.now() - approvedAt >= EMISION_MS) return NOT_READY;
    return { status: 'PENDING', document: null };
  }
  if (status !== 'SENT' && status !== 'ACCEPTED') return NOT_READY;

  const raw: Dict = isDict(invoice.responsePayload) ? invoice.responsePayload : {};
  // JsonValue no se deja filtrar con un guard de tipo: se trabaja como unknown[].
  const items: unknown[] = Array.isArray(raw.items) ? raw.items : [];
  const pagos: unknown[] = Array.isArray(raw.payments) ? raw.payments : [];

  const lines: InvoiceLineDTO[] = items
    .filter(isDict)
    .map((item) => {
      const quantity = num(item.quantity) ?? 1;
      const unitPrice = num(item.price) ?? 0;
      return {
        description: str(item.description) ?? itemDescription,
        quantity,
        unitPrice,
        total: num(item.total) ?? unitPrice * quantity,
      };
    });
  if (lines.length === 0) {
    lines.push({
      description: itemDescription,
      quantity: 1,
      unitPrice: payment.amount,
      total: payment.amount,
    });
  }

  // Impuestos agrupados por nombre y tarifa, sumando los de todos los items.
  const taxesByKey = new Map<string, InvoiceTaxDTO>();
  for (const item of items) {
    if (!isDict(item) || !Array.isArray(item.taxes)) continue;
    for (const tax of item.taxes) {
      if (!isDict(tax)) continue;
      const name = str(tax.name) ?? 'Impuesto';
      const percentage = num(tax.percentage);
      const key = `${name}|${percentage ?? ''}`;
      const current = taxesByKey.get(key) ?? { name, percentage, value: 0 };
      current.value += num(tax.value) ?? 0;
      taxesByKey.set(key, current);
    }
  }
  const taxes = [...taxesByKey.values()].filter((tax) => tax.value > 0);

  const total = num(raw.total) ?? payment.amount;
  const taxTotal = taxes.reduce((sum, tax) => sum + tax.value, 0);

  const prefix = str(raw.prefix);
  const number =
    str(raw.name) ??
    (prefix && invoice.number ? `${prefix}-${invoice.number}` : invoice.number) ??
    '—';

  const paymentMethod = pagos
    .filter(isDict)
    .map((p) => str(p.name))
    .find(Boolean) ?? null;

  const lot = payment.parkingLot;

  return {
    status: 'READY',
    document: {
      issuerName: lot.name,
      issuerNit: lot.nit,
      issuerAddress: lot.address,
      issuerCity: lot.city,
      electronic: Boolean(invoice.cufe),
      number,
      issuedAt: (payment.resolvedAt ?? payment.createdAt).toISOString(),
      customerName: payment.customerName ?? 'Consumidor final',
      customerDocument: payment.customerDocument,
      customerEmail: payment.customer?.email ?? null,
      lines,
      taxes,
      subtotal: total - taxTotal,
      total,
      paymentMethod,
      cufe: invoice.cufe,
    },
  };
}
