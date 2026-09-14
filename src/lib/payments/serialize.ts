import type { Payment, PaymentStatus, TerminalStage } from '@prisma/client';
import { env } from '@/lib/env';
import { isFinalStatus } from './service';

/**
 * Version del pago apta para la pantalla del punto de pago.
 *
 * Se excluye a proposito todo lo que identifica la infraestructura de cobro:
 * codigo y numero de terminal, codigo unico del comercio, red, la respuesta
 * cruda del proveedor. Esa informacion es confidencial y no le sirve de nada a
 * quien esta cobrando; que aparezca en una pantalla de cara al publico es un
 * riesgo, no una ayuda. Vive en la base de datos y en la administracion.
 */
export interface PaymentDTO {
  id: string;
  status: PaymentStatus;
  stage: TerminalStage;
  /** Instruccion concreta para el operador, segun la etapa del datafono. */
  instruction: string;
  amount: number;
  plate: string | null;
  vehicleIdentifier: string;
  vehicleType: string;
  /** Codigo del tiquete (`A7B48`). Los carros van por placa y no lo tienen. */
  ticketCode: string | null;
  /** Ingreso y permanencia liquidada, segun el sistema del parqueadero. */
  entryAt: string | null;
  stayMinutes: number | null;
  customerName: string | null;
  customerDocument: string | null;
  /** Referencia del cobro: el IdTransaccion que se envio al datafono. */
  reference: string | null;
  /** Datos del voucher del cliente. Nada de la terminal. */
  authorizationCode: string | null;
  receiptNumber: string | null;
  cardBrand: string | null;
  cardMask: string | null;
  failureReason: string | null;
  /** true cuando el estado ya es definitivo y el sondeo debe detenerse. */
  isFinal: boolean;
  /**
   * Enlace publico del comprobante, para el QR impreso. Lleva a la factura de
   * SIIGO cuando este lista. `null` si el pago no tiene token (cobros anteriores
   * a esta funcion).
   */
  receiptUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Que hacer en cada etapa del datafono.
 *
 * El aparato esta conectado por serial y no cobra solo: hay que iniciarlo a
 * mano. Sin este texto, el operador se queda mirando una pantalla que dice
 * "procesando" mientras el datafono espera que alguien lo toque.
 */
const INSTRUCTION: Record<TerminalStage, string> = {
  WAITING_TERMINAL: 'Pulsa INICIAR COBRO en el datafono para comenzar',
  STARTED: 'Sigue las indicaciones del datafono',
  READING_CARD: 'Pasa, inserta o acerca la tarjeta',
  RESOLVED: '',
};

export function stageInstruction(payment: {
  status: PaymentStatus;
  stage: TerminalStage;
}): string {
  if (isFinalStatus(payment.status)) return '';
  return INSTRUCTION[payment.stage];
}

export { isFinalStatus };

export function serializePayment(payment: Payment): PaymentDTO {
  return {
    id: payment.id,
    status: payment.status,
    stage: payment.terminalStage,
    instruction: stageInstruction({
      status: payment.status,
      stage: payment.terminalStage,
    }),
    amount: payment.amount,
    plate: payment.plate,
    vehicleIdentifier: payment.vehicleIdentifier,
    vehicleType: payment.vehicleType,
    ticketCode: payment.ticketCode,
    entryAt: payment.entryAt?.toISOString() ?? null,
    stayMinutes: payment.stayMinutes,
    customerName: payment.customerName,
    customerDocument: payment.customerDocument,
    reference: payment.providerTransactionId,
    authorizationCode: payment.authorizationCode,
    receiptNumber: payment.receiptNumber,
    cardBrand: payment.cardBrand,
    cardMask: payment.cardMask,
    failureReason: payment.failureReason,
    isFinal: isFinalStatus(payment.status),
    receiptUrl: payment.receiptToken
      ? `${env.APP_URL.replace(/\/+$/, '')}/factura/${payment.receiptToken}`
      : null,
    createdAt: payment.createdAt.toISOString(),
    resolvedAt: payment.resolvedAt?.toISOString() ?? null,
  };
}
