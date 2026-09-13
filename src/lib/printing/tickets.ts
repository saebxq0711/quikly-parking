import type { InvoiceDocumentDTO } from '@/lib/billing/invoice-print';
import type { PaymentDTO } from '@/lib/payments/serialize';
import { EscPos } from './escpos';

/**
 * Los papeles del kiosco en ESC/POS: la factura de SIIGO, el comprobante de respaldo y
 * la hoja de prueba. Tienen el mismo contenido que la version del navegador
 * (`invoice-ticket.tsx`, `receipt.tsx`); esta es la que sale por USB directo.
 */

const VEHICULO: Record<string, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  SCOOTER: 'Patineta',
};

function pesos(valor: number): string {
  return `$ ${Math.round(valor).toLocaleString('es-CO')}`;
}

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso));
}

export function facturaEscPos(factura: InvoiceDocumentDTO, pago: PaymentDTO): Uint8Array {
  const t = new EscPos().iniciar().alinear('centro');

  t.negrita(true).tamano(1, 2).linea(factura.issuerName).tamano(1, 1).negrita(false);
  for (const dato of [
    factura.issuerNit ? `NIT ${factura.issuerNit}` : null,
    factura.issuerAddress,
    factura.issuerCity,
  ]) {
    if (dato) t.linea(dato);
  }

  t.separador()
    .negrita(true)
    .linea(factura.electronic ? 'FACTURA ELECTRONICA DE VENTA' : 'FACTURA DE VENTA')
    .tamano(1, 2)
    .linea(`No. ${factura.number}`)
    .tamano(1, 1)
    .negrita(false)
    .linea(fecha(factura.issuedAt))
    .separador()
    .alinear('izquierda')
    .fila('Cliente', factura.customerName);
  if (factura.customerDocument) t.fila('Documento', factura.customerDocument);
  t.fila(pago.plate ? 'Placa' : 'Codigo', pago.plate ?? pago.vehicleIdentifier).separador();

  for (const item of factura.lines) {
    t.parrafo(item.description).fila(`${item.quantity} x ${pesos(item.unitPrice)}`, pesos(item.total));
  }
  t.separador();

  if (factura.taxes.length > 0) {
    t.fila('Subtotal', pesos(factura.subtotal));
    for (const impuesto of factura.taxes) {
      t.fila(
        `${impuesto.name}${impuesto.percentage !== null ? ` ${impuesto.percentage}%` : ''}`,
        pesos(impuesto.value),
      );
    }
  }
  t.negrita(true).tamano(1, 2).fila('TOTAL', pesos(factura.total)).tamano(1, 1).negrita(false).separador();

  if (factura.paymentMethod) t.fila('Forma de pago', factura.paymentMethod);
  if (pago.cardBrand) t.fila('Tarjeta', `${pago.cardBrand}${pago.cardMask ? ` ${pago.cardMask}` : ''}`);
  if (pago.authorizationCode) t.fila('Autorizacion', pago.authorizationCode);

  if (factura.cufe) t.linea().negrita(true).linea('CUFE').negrita(false).parrafo(factura.cufe);

  t.alinear('centro');
  if (pago.receiptUrl) t.linea().qr(pago.receiptUrl).linea('Escanea para ver tu factura en linea');
  if (factura.customerEmail) t.parrafo(`Tambien la enviamos a ${factura.customerEmail}`);
  return t.linea('Gracias por tu visita').avanzar(3).cortar().bytesFinales();
}

export function comprobanteEscPos(pago: PaymentDTO, parqueadero: string): Uint8Array {
  const t = new EscPos()
    .iniciar()
    .alinear('centro')
    .negrita(true)
    .tamano(1, 2)
    .linea(parqueadero)
    .tamano(1, 1)
    .linea('COMPROBANTE DE PAGO')
    .negrita(false)
    .separador()
    .alinear('izquierda')
    .fila('Fecha', fecha(pago.resolvedAt ?? pago.createdAt))
    .fila('Vehiculo', VEHICULO[pago.vehicleType] ?? pago.vehicleType)
    .fila(pago.plate ? 'Placa' : 'Codigo', pago.plate ?? pago.vehicleIdentifier);
  if (pago.cardBrand) t.fila('Tarjeta', `${pago.cardBrand}${pago.cardMask ? ` ${pago.cardMask}` : ''}`);
  if (pago.authorizationCode) t.fila('Autorizacion', pago.authorizationCode);
  if (pago.receiptNumber) t.fila('Recibo', pago.receiptNumber);

  t.separador().negrita(true).tamano(1, 2).fila('TOTAL', pesos(pago.amount)).tamano(1, 1).negrita(false);

  t.alinear('centro');
  if (pago.receiptUrl) t.linea().qr(pago.receiptUrl).linea('Escanea para ver tu factura electronica');
  return t
    .parrafo('Este papel es tu comprobante de pago. La factura electronica llega a tu correo.')
    .avanzar(3)
    .cortar()
    .bytesFinales();
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
    .linea(fecha(new Date().toISOString()))
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
