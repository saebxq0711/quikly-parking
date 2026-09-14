import type { NovaTicketRow } from '@/integrations/nova-parking/panel';

/**
 * Como se lee un tiquete de Nova Parking en el panel y en el Excel: fechas, permanencia,
 * si ya pago y con que. Funciones puras, validas en el servidor y en el navegador, para
 * que la pantalla y el archivo digan exactamente lo mismo.
 */

/**
 * Fecha de Nova Parking como instante real.
 *
 * Llega como `31/08/26 07:15:49` (hora de Bogota, sin zona) o como ISO. Sin la zona, un
 * servidor en otro huso (Vercel corre en UTC) correria todas las horas cinco horas.
 */
export function parseUpstreamDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const local = value.match(/^(\d{2})\/(\d{2})\/(\d{2,4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, dia, mes, anio, hora, minuto, segundo] = local;
    const completo = anio.length === 2 ? `20${anio}` : anio;
    const fecha = new Date(`${completo}-${mes}-${dia}T${hora}:${minuto}:${segundo ?? '00'}-05:00`);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const conZona = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}-05:00`;
  const fecha = new Date(conZona);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Minutos entre la entrada y la salida; si sigue adentro, hasta ahora. */
export function stayMinutes(entrada: Date | null, salida: Date | null, ahora = new Date()): number | null {
  if (!entrada) return null;
  const minutos = ((salida ?? ahora).getTime() - entrada.getTime()) / 60_000;
  return minutos >= 0 ? Math.round(minutos) : null;
}

/** Medios de pago como los registra Nova Parking. */
const METODO: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  CREDIT_CARD: 'Tarjeta',
  DEBIT_CARD: 'Tarjeta debito',
  TRANSFER: 'Transferencia',
  QR: 'Pago con QR',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  MONTHLY: 'Mensualidad',
  OTHER: 'Otro',
};

export function paymentMethodLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const conocido = METODO[code.toUpperCase()];
  if (conocido) return conocido;
  const legible = code.replace(/_/g, ' ').toLowerCase();
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}

type TicketState = Pick<NovaTicketRow, 'status' | 'paidAt' | 'amount' | 'cancelled'>;

/**
 * Si el tiquete ya se pago. Nova Parking marca `OUT` al cobrar (en caja o por el
 * kiosco), asi que un tiquete que salio con valor quedo pago aunque no traiga el log.
 */
export function ticketPaid(ticket: TicketState): boolean {
  if (ticket.cancelled) return false;
  return (
    Boolean(ticket.paidAt) ||
    ticket.status === 'PAID' ||
    (ticket.status === 'OUT' && (ticket.amount ?? 0) > 0)
  );
}

export function ticketStateLabel(ticket: Pick<NovaTicketRow, 'status' | 'cancelled'>): string {
  if (ticket.cancelled) return 'Anulado';
  if (ticket.status === 'IN') return 'Adentro';
  if (ticket.status === 'PAID') return 'Pagado';
  if (ticket.status === 'OUT') return 'Salio';
  return ticket.status ?? '—';
}
