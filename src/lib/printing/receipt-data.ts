import type { ParkingLot } from '@prisma/client';
import type { InvoiceDocumentDTO } from '@/lib/billing/invoice-print';
import type { PaymentDTO } from '@/lib/payments/serialize';

/**
 * Lo que dicen los papeles del kiosco: el comprobante de pago y la factura de SIIGO.
 *
 * Hay dos formas de imprimir —comandos ESC/POS por USB (`tickets.ts`) y HTML por el
 * navegador (`receipt.tsx`)— y las dos pintan este mismo documento. Asi el cliente se
 * lleva el mismo papel salga por donde salga, y un dato nuevo se agrega en un solo lugar.
 *
 * Los datos del parqueadero salen de nuestra base (se piden al crearlo); los del
 * vehiculo, de lo que el sistema del parqueadero devolvio al iniciar el cobro. Una fila
 * sin dato no se imprime.
 */

export interface ReceiptIssuer {
  name: string;
  legalName: string | null;
  nit: string | null;
  taxRegime: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
}

export interface ReceiptRow {
  label: string;
  value: string;
}

export interface ReceiptSection {
  title: string;
  rows: ReceiptRow[];
}

export interface ReceiptItem {
  description: string;
  detail: string;
  total: string;
}

export interface ReceiptDocument {
  /** Razon social, en grande. */
  title: string;
  /** NIT, regimen, direccion, ciudad, telefono. */
  headerLines: string[];
  heading: string;
  number: string | null;
  issuedAt: string;
  sections: ReceiptSection[];
  items: ReceiptItem[];
  /** Subtotal e impuestos, antes del total. */
  totals: ReceiptRow[];
  total: string;
  cufe: string | null;
  qrUrl: string | null;
  qrCaption: string | null;
  notes: string[];
}

export const VEHICULO: Record<string, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  SCOOTER: 'Patineta',
};

type LotIssuerFields = Pick<
  ParkingLot,
  'name' | 'legalName' | 'nit' | 'taxRegime' | 'address' | 'city' | 'department' | 'phone' | 'email'
>;

export function emisorDe(lot: LotIssuerFields): ReceiptIssuer {
  return {
    name: lot.name,
    legalName: lot.legalName,
    nit: lot.nit,
    taxRegime: lot.taxRegime,
    address: lot.address,
    city: lot.city,
    department: lot.department,
    phone: lot.phone,
    email: lot.email,
  };
}

export function pesos(valor: number): string {
  return `$ ${Math.round(valor).toLocaleString('es-CO')}`;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Bogota',
});

export function fechaHora(iso: string): string {
  return FORMATO_FECHA.format(new Date(iso));
}

/** "45 min", "2 h 05 min", "1 d 3 h 20 min". */
export function permanencia(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const min = String(total % 60).padStart(2, '0');
  if (dias > 0) return `${dias} d ${horas} h ${min} min`;
  if (horas > 0) return `${horas} h ${min} min`;
  return `${total} min`;
}

function filas(pares: [string, string | null | undefined][]): ReceiptRow[] {
  return pares
    .filter((par): par is [string, string] => Boolean(par[1]))
    .map(([label, value]) => ({ label, value }));
}

function encabezado(emisor: ReceiptIssuer): Pick<ReceiptDocument, 'title' | 'headerLines'> {
  const razonSocial = emisor.legalName ?? emisor.name;
  const lugar = [emisor.city, emisor.department].filter(Boolean).join(', ');
  return {
    title: razonSocial,
    headerLines: [
      razonSocial !== emisor.name ? emisor.name : null,
      emisor.nit ? `NIT ${emisor.nit}` : null,
      emisor.taxRegime,
      emisor.address,
      lugar || null,
      emisor.phone ? `Tel. ${emisor.phone}` : null,
      emisor.email,
    ].filter((linea): linea is string => Boolean(linea)),
  };
}

function seccionCliente(nombre: string | null, documento: string | null): ReceiptSection {
  return {
    title: 'Cliente',
    rows: filas([
      ['Nombre', nombre ?? 'Consumidor final'],
      ['Documento', documento],
    ]),
  };
}

function seccionVehiculo(pago: PaymentDTO): ReceiptSection {
  // La salida es el momento del pago: ahi se liquido la permanencia.
  const salida = pago.resolvedAt ?? pago.createdAt;
  const minutos =
    pago.stayMinutes ??
    (pago.entryAt ? (Date.parse(salida) - Date.parse(pago.entryAt)) / 60_000 : null);
  return {
    title: 'Vehiculo',
    rows: filas([
      ['Tipo', VEHICULO[pago.vehicleType] ?? pago.vehicleType],
      ['Placa', pago.plate],
      ['Tiquete', pago.ticketCode ?? (pago.plate ? null : pago.vehicleIdentifier)],
      ['Entrada', pago.entryAt ? fechaHora(pago.entryAt) : null],
      ['Salida', fechaHora(salida)],
      ['Permanencia', minutos !== null && Number.isFinite(minutos) ? permanencia(minutos) : null],
    ]),
  };
}

function seccionPago(pago: PaymentDTO, formaDePago: string | null): ReceiptSection {
  return {
    title: 'Pago',
    rows: filas([
      ['Forma de pago', formaDePago ?? 'Tarjeta (datafono)'],
      ['Tarjeta', pago.cardBrand ? `${pago.cardBrand}${pago.cardMask ? ` ${pago.cardMask}` : ''}` : null],
      ['Autorizacion', pago.authorizationCode],
      ['Recibo', pago.receiptNumber],
      ['Referencia', pago.reference],
    ]),
  };
}

export function comprobante(pago: PaymentDTO, emisor: ReceiptIssuer): ReceiptDocument {
  return {
    ...encabezado(emisor),
    heading: 'Comprobante de pago',
    number: null,
    issuedAt: fechaHora(pago.resolvedAt ?? pago.createdAt),
    sections: [
      seccionCliente(pago.customerName, pago.customerDocument),
      seccionVehiculo(pago),
      seccionPago(pago, null),
    ],
    items: [],
    totals: [],
    total: pesos(pago.amount),
    cufe: null,
    qrUrl: pago.receiptUrl,
    qrCaption: pago.receiptUrl ? 'Escanea para ver tu factura electronica' : null,
    notes: [
      'Este papel es tu comprobante de pago. La factura electronica llega a tu correo.',
      'Gracias por tu visita',
    ],
  };
}

export function factura(doc: InvoiceDocumentDTO, pago: PaymentDTO): ReceiptDocument {
  return {
    ...encabezado(doc.issuer),
    heading: doc.electronic ? 'Factura electronica de venta' : 'Factura de venta',
    number: `No. ${doc.number}`,
    issuedAt: fechaHora(doc.issuedAt),
    sections: [
      seccionCliente(doc.customerName, doc.customerDocument),
      seccionVehiculo(pago),
      seccionPago(pago, doc.paymentMethod),
    ],
    items: doc.lines.map((linea) => ({
      description: linea.description,
      detail: `${linea.quantity} x ${pesos(linea.unitPrice)}`,
      total: pesos(linea.total),
    })),
    totals:
      doc.taxes.length > 0
        ? [
            { label: 'Subtotal', value: pesos(doc.subtotal) },
            ...doc.taxes.map((impuesto) => ({
              label: `${impuesto.name}${impuesto.percentage !== null ? ` ${impuesto.percentage}%` : ''}`,
              value: pesos(impuesto.value),
            })),
          ]
        : [],
    total: pesos(doc.total),
    cufe: doc.cufe,
    qrUrl: pago.receiptUrl,
    qrCaption: pago.receiptUrl ? 'Escanea para ver tu factura en linea' : null,
    notes: [
      doc.customerEmail ? `Tambien la enviamos a ${doc.customerEmail}` : null,
      'Gracias por tu visita',
    ].filter((nota): nota is string => Boolean(nota)),
  };
}
