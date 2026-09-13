import type { Payment } from '@prisma/client';

/**
 * Construccion del payload de factura para SIIGO.
 *
 * ============================ IMPORTANTE ============================
 * El ejemplo de payload entregado con las credenciales (siigo_api.md) es de un
 * kiosco de comida (hamburguesas, bebidas, extras). NO es el de un parqueadero.
 * De ese ejemplo se puede leer la ESTRUCTURA, pero no los VALORES, y los
 * siguientes datos NO estan definidos en ninguna documentacion del proyecto:
 *
 *   - `document.id`        : tipo de comprobante de venta del comercio
 *   - `seller`             : id del vendedor en SIIGO
 *   - `payments[].id`      : forma de pago (catalogo /v1/payment-types)
 *   - `items[].code`       : codigo del producto/servicio de parqueadero
 *   - `taxes`              : si el servicio de parqueadero lleva IVA y cual
 *   - Tipo e identificacion del cliente cuando el parqueadero no los captura
 *
 * Siguiendo la regla del proyecto (CLAUDE.md secciones 31 y 37) NO se inventan.
 * Se leen de la configuracion; si falta alguno, la facturacion NO se envia con
 * valores adivinados: queda PENDING con un motivo explicito, el pago sigue
 * siendo valido, y el SuperAdmin ve exactamente que dato falta.
 * ====================================================================
 */

export interface SiigoInvoiceSettings {
  /** `document.id` — tipo de comprobante. PENDIENTE de confirmar con el cliente. */
  documentId: number | null;
  /** `seller` — id del vendedor en SIIGO. PENDIENTE. */
  sellerId: number | null;
  /** `payments[].id` — forma de pago del catalogo de SIIGO. PENDIENTE. */
  paymentTypeId: number | null;
  /** `items[].code` — codigo del servicio de parqueadero en SIIGO. PENDIENTE. */
  itemCode: string | null;
  /** Descripcion del item en la factura. */
  itemDescription: string;
  /** Datos del cliente generico usado cuando el vehiculo no tiene cliente asociado. */
  defaultCustomerIdType: string | null;
  defaultCustomerIdentification: string | null;
  defaultCustomerName: string | null;
  /** Si se debe solicitar el envio del documento electronico y el correo. */
  sendStamp: boolean;
  sendMail: boolean;
}

export const REQUIRED_SETTING_LABELS: Record<string, string> = {
  documentId: 'Tipo de comprobante',
  sellerId: 'Vendedor',
  paymentTypeId: 'Forma de pago',
  itemCode: 'Codigo del servicio de parqueadero',
  defaultCustomerIdentification: 'Identificacion del cliente por defecto',
};

/**
 * Verifica que la configuracion este completa.
 * Devuelve la lista de datos faltantes, en lenguaje entendible para el
 * SuperAdmin. Lista vacia = se puede facturar.
 */
export function findMissingSettings(settings: SiigoInvoiceSettings): string[] {
  const missing: string[] = [];
  if (settings.documentId === null) missing.push(REQUIRED_SETTING_LABELS.documentId);
  if (settings.sellerId === null) missing.push(REQUIRED_SETTING_LABELS.sellerId);
  if (settings.paymentTypeId === null) {
    missing.push(REQUIRED_SETTING_LABELS.paymentTypeId);
  }
  if (!settings.itemCode) missing.push(REQUIRED_SETTING_LABELS.itemCode);
  if (!settings.defaultCustomerIdentification) {
    missing.push(REQUIRED_SETTING_LABELS.defaultCustomerIdentification);
  }
  return missing;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Arma el cuerpo de la factura a partir de un pago aprobado.
 *
 * El monto se toma del pago APROBADO, no del monto solicitado: si la red
 * aprobo un valor distinto, la factura debe reflejar lo que realmente se cobro.
 */
export function buildInvoicePayload(
  payment: Payment,
  settings: SiigoInvoiceSettings,
  parkingLot: { name: string },
): Record<string, unknown> {
  const missing = findMissingSettings(settings);
  if (missing.length > 0) {
    throw new Error(
      `Configuracion de SIIGO incompleta. Falta: ${missing.join(', ')}.`,
    );
  }

  /*
    Los datos del cliente salen de lo que el mismo escribio en el kiosco. Solo
    si no se identifico se cae al consumidor final: una factura sin cliente
    concreto es valida, pero una con el cliente equivocado no.
  */
  const identification =
    payment.customerDocument ?? settings.defaultCustomerIdentification!;
  const name = payment.customerName ?? settings.defaultCustomerName ?? 'Consumidor final';
  // SIIGO espera el nombre como arreglo [nombres, apellidos].
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(' ');
  const lastName = nameParts.slice(Math.ceil(nameParts.length / 2)).join(' ') || firstName;

  const vehicleRef = payment.plate ?? payment.vehicleIdentifier;

  return {
    document: { id: settings.documentId },
    date: toIsoDate(payment.resolvedAt ?? payment.createdAt),
    customer: {
      person_type: 'Person',
      // `id_type` "13" = Cedula de ciudadania, el valor usado en el ejemplo
      // entregado. Configurable porque puede variar por comercio.
      id_type: settings.defaultCustomerIdType ?? '13',
      identification,
      branch_office: 0,
      name: [firstName, lastName],
    },
    seller: settings.sellerId,
    stamp: { send: settings.sendStamp },
    mail: { send: settings.sendMail },
    /*
      La referencia del pago va en las observaciones para que cada factura sea
      rastreable hasta su cobro, y para que dos cobros del mismo vehiculo por el
      mismo valor el mismo dia no se vean identicos: SIIGO rechaza documentos
      duplicados con "The document already exists".
    */
    observations:
      `Parqueadero ${parkingLot.name} - ${vehicleRef} - ` +
      `tiquete ${payment.externalTicketId} - pago ${payment.id}` +
      (payment.authorizationCode ? ` - aut. ${payment.authorizationCode}` : ''),
    items: [
      {
        code: settings.itemCode,
        description: `${settings.itemDescription} (${vehicleRef})`,
        quantity: 1,
        price: payment.amount,
        discount: 0,
      },
    ],
    payments: [
      {
        id: settings.paymentTypeId,
        value: payment.amount,
        due_date: toIsoDate(payment.resolvedAt ?? payment.createdAt),
      },
    ],
  };
}
