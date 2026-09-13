import type { NovaCheckout, NovaTicket } from './types';

/**
 * Normalizadores tolerantes.
 *
 * La forma exacta del JSON que devuelve Nova Parking no esta documentada. En vez
 * de adivinar un unico nombre de campo y romperse ante la primera diferencia,
 * cada valor se busca entre varios alias plausibles (snake_case y camelCase,
 * espanol e ingles). Si ninguno aparece, el campo queda en null y el flujo lo
 * trata como "dato no disponible" en lugar de fallar.
 *
 * El unico campo verdaderamente obligatorio es el id del tiquete y el monto:
 * sin ellos no se puede cobrar y se levanta un error explicito.
 */

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Busca la primera clave presente y no vacia entre varios alias. */
function pick(source: Dict, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Convierte la fecha de ingreso al formato ISO.
 *
 * Nova Parking la entrega como `31/08/26 07:15:49` — `%d/%m/%y %H:%M:%S`, hora
 * local de Bogota y SIN zona horaria. Parsearla como ISO a ciegas falla o,
 * peor, la interpreta mal (el 08/09 seria septiembre en vez de agosto).
 *
 * Se le añade el desfase de Colombia (-05:00, sin horario de verano) para que
 * quede sin ambiguedad. Si llega en otro formato se devuelve tal cual y que lo
 * resuelva quien la muestre.
 */
export function asEntryDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;

  const match = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{2,4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return raw;

  const [, day, month, year, hour, minute, second = '00'] = match;
  // Año de dos digitos: 26 es 2026. El sistema no existia antes de 2000.
  const fullYear = year.length === 2 ? `20${year}` : year;

  return `${fullYear}-${month}-${day}T${hour}:${minute}:${second}-05:00`;
}

/**
 * Convierte a entero de pesos. Acepta numero o texto porque el sistema existente
 * ha devuelto montos como string (bug real documentado en HANDOFF.md seccion 5,
 * punto 3: el monto llegaba como texto y reventaba al sumarse).
 */
export function asAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    // Quita separadores de miles y simbolos de moneda antes de convertir.
    const cleaned = value.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '');
    const parsed = Number(cleaned.replace(',', '.'));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 's', 'si', 'yes'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

/**
 * Extrae el tiquete de una respuesta que puede venir envuelta de varias formas:
 * el objeto directo, `{ ticket: {...} }`, `{ data: {...} }` o una lista con un
 * unico resultado (las vistas `find-ticket/*` de Django devuelven lista).
 */
export function unwrapTicketPayload(payload: unknown): Dict | null {
  if (Array.isArray(payload)) {
    return payload.length > 0 && isDict(payload[0]) ? payload[0] : null;
  }
  if (!isDict(payload)) return null;

  for (const key of ['ticket', 'data', 'result', 'results']) {
    const nested = payload[key];
    if (Array.isArray(nested)) {
      return nested.length > 0 && isDict(nested[0]) ? nested[0] : null;
    }
    if (isDict(nested)) return nested;
  }
  return payload;
}

export function normalizeTicket(raw: unknown): NovaTicket | null {
  const source = unwrapTicketPayload(raw);
  if (!source) return null;

  const id = asString(pick(source, 'id', 'ticket_id', 'ticketId', 'pk'));
  if (!id) return null;

  const customer = isDict(pick(source, 'customer', 'client', 'cliente'))
    ? (pick(source, 'customer', 'client', 'cliente') as Dict)
    : source;

  const vehicleTypeRaw = pick(
    source,
    'vehicle_type_label',
    'vehicleTypeLabel',
    'vehicle_type_name',
    'tipo_vehiculo',
  );

  return {
    id,
    code: asString(pick(source, 'code', 'codigo')),
    plate: asString(pick(source, 'plate', 'placa', 'plate_number')),
    // Si no viene el nombre, se prefiere no decir nada: el campo `vehicle_type`
    // suelto es el id numerico de su catalogo, y un "3" en pantalla no le dice
    // nada a nadie.
    vehicleTypeLabel: asString(
      vehicleTypeRaw ??
        (isDict(source.vehicle_type)
          ? pick(source.vehicle_type as Dict, 'label', 'name')
          : null),
    ),
    entryAt: asEntryDate(
      pick(
        source,
        'checked_in',
        'entry_at',
        'entryAt',
        'entry_date',
        'date_in',
        'created_at',
        'fecha_ingreso',
      ),
    ),
    /*
      Nova Parking no envia los minutos en la busqueda; los manda en
      `pay-checkout` como `billedTime` junto a `billingUnit`. Solo se toma como
      minutos si la unidad efectivamente lo es: interpretar horas como minutos
      mostraria una permanencia absurda.
    */
    minutes: (() => {
      const unit = (asString(pick(source, 'billingUnit')) ?? '').toLowerCase();
      const billed = asAmount(pick(source, 'billedTime'));
      if (billed !== null && (unit === '' || unit.startsWith('minuto'))) {
        return billed;
      }
      return asAmount(
        pick(source, 'minutes', 'minutos', 'total_minutes', 'duration'),
      );
    })(),
    customerName: asString(
      pick(customer, 'name', 'nombre', 'customer_name', 'full_name'),
    ),
    customerDocument: asString(
      pick(
        customer,
        'document',
        'documento',
        'identification',
        'nit',
        'customer_document',
      ),
    ),
    status: asString(pick(source, 'status', 'estado')),
  };
}

export function normalizeCheckout(raw: unknown): NovaCheckout | null {
  const ticket = normalizeTicket(raw);
  if (!ticket) return null;

  const source = isDict(raw) ? raw : {};
  const ticketSource = unwrapTicketPayload(raw) ?? {};

  /*
    El monto viene en `price` y es un NUMERO DECIMAL, no un entero: el calculo
    de la tarifa produce cosas como 4419.999999999999. Se redondea aqui, una
    sola vez, y ese entero es el que se cobra al datafono y el que se factura —
    los tres valores tienen que ser el mismo o el arqueo no cuadra.
  */
  const amount =
    asAmount(
      pick(
        source,
        'price',
        'amount',
        'total',
        'value',
        'valor',
        'precio',
        'total_pagar',
        'totalToPay',
        'to_pay',
      ),
    ) ??
    asAmount(
      pick(ticketSource, 'price', 'amount', 'total', 'value', 'valor', 'precio'),
    );

  if (amount === null) return null;

  const status = (ticket.status ?? '').toUpperCase();

  return {
    ticket,
    amount,
    breakdown: isDict(pick(source, 'breakdown', 'detalle', 'detail'))
      ? (pick(source, 'breakdown', 'detalle', 'detail') as Dict)
      : null,
    alreadyPaid:
      asBool(pick(source, 'already_paid', 'alreadyPaid', 'paid', 'pagado')) ||
      status === 'PAID' ||
      status === 'OUT',
  };
}
