import { AppError } from '@/lib/errors';
import type { NovaParkingClient } from './client';

/**
 * Lecturas del panel del administrador de parqueadero.
 *
 * TODO lo de este archivo es de SOLO LECTURA. Pasa por `client.read()`, que solo
 * hace GET, y las rutas del otro lado quedan restringidas a GET tambien
 * (REQUERIMIENTOS_PANEL_ADMIN.md seccion 2). El panel no puede modificar nada
 * del sistema del parqueadero ni por accidente.
 *
 * Cada funcion devuelve un `PanelResult` en vez de lanzar: mientras Nova Parking
 * no exponga una ruta por el tunel, esa tarjeta de la pantalla dice que esta
 * esperando, y el resto de la pagina sigue funcionando. Es deliberado que se
 * distinga "todavia no esta publicada" de "no hay datos": la primera es trabajo
 * pendiente de la otra parte y el administrador merece saberlo, en vez de ver
 * una tabla vacia y creer que su parqueadero no tuvo movimiento.
 */

/* ------------------------------------------------------------------ Tipos */

export type PanelResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'not-exposed' | 'unreachable'; detail: string };

export interface NovaDashboard {
  inside: number | null;
  today: number | null;
  month: number | null;
  monthRevenue: number | null;
}

export interface NovaVehicleInside {
  ticketId: string;
  plate: string | null;
  vehicleType: string | null;
  checkedInAt: string | null;
  /** "Mensualidad" o "Regular", tal como lo clasifica Nova Parking. */
  clientKind: string | null;
}

export interface NovaInsideReport {
  total: number;
  cars: number | null;
  motorcycles: number | null;
  bicycles: number | null;
  scooters: number | null;
  /** Tiquetes cuyo tipo quedo en "Por Definir" en el catalogo de ellos. */
  undefinedType: number | null;
  monthly: number | null;
  regular: number | null;
  vehicles: NovaVehicleInside[];
}

/** Un movimiento del tiquete: entro, se cobro, salio. */
export interface NovaTicketEvent {
  kind: 'IN' | 'PAID' | 'OUT' | 'COPY' | string;
  at: string | null;
  amount: number | null;
  /** Quien lo hizo. Hoy suele ser el id; ver REQUERIMIENTOS_PANEL_ADMIN.md 4.3. */
  responsible: string | null;
}

export interface NovaTicketRow {
  /** Autoincremental de Nova Parking. Dato de maquina: no se muestra. */
  id: string;
  /** Codigo del tiquete (`A7B48`). Es lo que el cliente conoce y lo que se muestra. */
  code: string | null;
  plate: string | null;
  vehicleType: string | null;
  status: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  amount: number | null;
  paymentMethod: string | null;
  cancelled: boolean;
  events: NovaTicketEvent[];
  /** Derivados de los eventos, que es donde vive la trazabilidad real. */
  enteredBy: string | null;
  chargedBy: string | null;
  paidAt: string | null;
  /**
   * Foto que tomo la camara cuando el vehiculo entro, tal como la guarda Nova
   * Parking: una ruta suya (`/media/parking_tickets/...`), no una URL publica.
   * Quien la quiera ver pasa por nuestro proxy (`/api/panel/[slug]/foto`), que es
   * el unico que conoce el tunel y el token.
   */
  photo: string | null;
  /** Segunda camara: el plano cerrado de la placa, cuando existe. */
  platePhoto: string | null;
}

export interface NovaTicketPage {
  total: number;
  rows: NovaTicketRow[];
}

export interface NovaCashBox {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSE' | string;
  responsibleName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  lastUsedAt: string | null;
  automatic: boolean;
}

export interface NovaCashMovement {
  id: string;
  kind: string;
  at: string | null;
  responsible: string | null;
  ticketId: string | null;
  amount: number | null;
  cashAfter: number | null;
  comment: string | null;
}

export interface NovaCashBoxDetail extends NovaCashBox {
  cashAvailable: number | null;
  movements: NovaCashMovement[];
}

export interface TicketFilters {
  page?: number;
  plate?: string;
  status?: string;
  vehicleType?: string;
  fromDate?: string;
  toDate?: string;
}

/* -------------------------------------------------------------- Auxiliares */

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null;

function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Extiende una fecha suelta al final del dia.
 *
 * Nova Parking filtra con `checked_in__range` y convierte la fecha con
 * `fromisoformat`, asi que `2026-09-12` le llega como las 00:00. Pedir
 * "del 12 al 12" daba un rango de ancho cero y devolvia CERO tiquetes — la
 * pantalla decia "sin movimiento" en un dia que si lo tuvo, que es peor que no
 * mostrar nada.
 */
function finDelDia(fecha: string | undefined): string | undefined {
  if (!fecha) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T23:59:59` : fecha;
}

/**
 * Convierte el fallo en algo que la pantalla pueda explicar.
 *
 * Un 404 o un 405 desde el tunel casi siempre significan que la ruta todavia no
 * esta en el `config.yml` de Nova Parking, no que el dato no exista — el borde
 * de Cloudflare responde antes de que Django vea nada. Distinguirlo evita que el
 * administrador crea que su parqueadero esta vacio.
 */
function toFailure(error: unknown): { ok: false; reason: 'not-exposed' | 'unreachable'; detail: string } {
  if (error instanceof AppError) {
    const detail = error.detail as { status?: number } | undefined;
    const status = detail?.status;

    // 404/405: el borde de Cloudflare respondio antes que Django — la ruta no
    // esta en el `config.yml` del tunel.
    // 401/403: la ruta llego a Django, pero su vista exige una sesion que no
    // tenemos. Varias de estas son `IsAuthenticated` y necesitan el decorador
    // de solo lectura que se le pidio (REQUERIMIENTOS_PANEL_ADMIN.md 3.1).
    // Los dos casos son lo mismo para el administrador: falta habilitarlo del
    // otro lado. Llamarlo "sin conexion" lo mandaria a revisar su internet.
    if (
      error.code === 'NOT_FOUND' ||
      status === 404 ||
      status === 405 ||
      status === 401 ||
      status === 403
    ) {
      return {
        ok: false,
        reason: 'not-exposed',
        detail: 'El sistema del parqueadero todavia no publica esta consulta.',
      };
    }
    return { ok: false, reason: 'unreachable', detail: error.publicMessage };
  }
  return {
    ok: false,
    reason: 'unreachable',
    detail: 'No fue posible consultar la informacion en este momento.',
  };
}

/**
 * Presupuesto de tiempo para las consultas del panel.
 *
 * Mas largo que el del kiosco (8 s) a proposito: alla hay un cliente parado
 * frente a la pantalla y rendirse rapido es lo correcto; aqui es un
 * administrador consultando, y el tunel entra a un PC de desarrollo que tarda lo
 * suyo. Medido contra el enlace real: la mayoria responde en 0,5-2,5 s, pero el
 * volcado de exportacion se va a ~12 s y con 8 s nunca llegaba.
 */
const PANEL_TIMEOUT_MS = 30_000;

async function read<T>(
  client: NovaParkingClient,
  path: string,
  query: Record<string, string | number | undefined>,
  operation: string,
  parse: (raw: unknown) => T,
): Promise<PanelResult<T>> {
  try {
    return {
      ok: true,
      data: parse(await client.read(path, query, operation, PANEL_TIMEOUT_MS)),
    };
  } catch (error) {
    const failure = toFailure(error);
    // Una ruta que todavia no esta publicada es el estado esperado hoy, no una
    // falla: registrarla como error llena la consola de rojo y esconde lo que
    // si hay que mirar.
    const log = failure.reason === 'not-exposed' ? console.warn : console.error;
    log('[panel] consulta no disponible', {
      operation,
      path,
      motivo: failure.reason,
    });
    return failure;
  }
}

/* -------------------------------------------------------------- Consultas */

/** Cifras de cabecera: cuantos hay adentro, cuantos hoy, cuanto va del mes. */
export function getDashboard(client: NovaParkingClient) {
  return read(client, '/api/parking/dashboard/', {}, 'dashboard', (raw) => {
    const d = isDict(raw) ? raw : {};
    return {
      inside: num(d.presentTickets),
      today: num(d.todayTickets),
      month: num(d.thisMonthTickets),
      monthRevenue: num(d.totalProfitThisMonth),
    } satisfies NovaDashboard;
  });
}

/** Quien esta adentro en este momento. */
export function getVehiclesInside(client: NovaParkingClient) {
  return read(
    client,
    '/api/reports/vehicles-in-parking/',
    {},
    'vehiclesInside',
    (raw) => {
      const d = isDict(raw) ? raw : {};
      const vehicles = list(d.vehicles).flatMap((item) => {
        if (!isDict(item)) return [];
        const id = str(item.id);
        if (!id) return [];
        return [
          {
            ticketId: id,
            plate: str(item.plate),
            vehicleType: str(item.vehicle_type),
            checkedInAt: str(item.checked_in),
            clientKind: str(item.client_type),
          } satisfies NovaVehicleInside,
        ];
      });

      return {
        total: num(d.total_vehicles) ?? vehicles.length,
        cars: num(d.total_cars),
        motorcycles: num(d.total_motorcycles),
        bicycles: num(d.total_bicycles),
        scooters: num(d.total_scooters),
        undefinedType: num(d.total_undefined),
        monthly: num(d.total_monthly),
        regular: num(d.total_regular),
        vehicles,
      } satisfies NovaInsideReport;
    },
  );
}

function parseEvents(raw: unknown): NovaTicketEvent[] {
  return list(raw).flatMap((item) => {
    if (!isDict(item)) return [];
    const kind = str(item.log_type);
    if (!kind) return [];
    return [
      {
        kind,
        at: str(item.timestamp),
        amount: num(item.cash_charged),
        responsible: str(item.responsible_name) ?? str(item.responsible),
      } satisfies NovaTicketEvent,
    ];
  });
}

function parseTicketRow(item: unknown): NovaTicketRow[] {
  if (!isDict(item)) return [];
  const id = str(item.id);
  if (!id) return [];

  const events = parseEvents(item.logs);
  // La trazabilidad ("quien lo dejo entrar", "quien cobro") no viene en campos
  // propios: hay que leerla de los logs, que es donde Nova Parking la guarda.
  const entry = events.find((e) => e.kind === 'IN');
  const paid = events.find((e) => e.kind === 'PAID');

  // El nombre del tipo viene resuelto desde el 2026-09-11 (`vehicle_type_label`).
  // El campo `vehicle_type` suelto es el id de su catalogo: no sirve en pantalla.
  const vehicle = item.vehicle_type;

  /*
    Fotos de la entrada. Nova Parking las guarda en dos campos del tiquete
    (`front_image`, `plate_image`) y ademas en una lista aparte (`images`) que
    usan las instalaciones con varias camaras. Se mira primero el campo propio y
    despues la lista, igual que hace su propio buscador de tiquetes.
  */
  const galeria = list(item.images).flatMap((foto) =>
    isDict(foto) ? [str(foto.image)].filter(Boolean) : [],
  ) as string[];
  const photo = str(item.front_image) ?? galeria[0] ?? null;

  return [
    {
      id,
      code: str(item.code),
      plate: str(item.plate),
      vehicleType:
        str(item.vehicle_type_label) ??
        (isDict(vehicle) ? str(vehicle.label) : null),
      status: str(item.status),
      checkedInAt: str(item.checked_in),
      checkedOutAt: str(item.checked_out),
      amount: num(item.price),
      paymentMethod: str(item.payment_method),
      cancelled: item.cancelled === true,
      events,
      enteredBy: entry?.responsible ?? null,
      chargedBy: paid?.responsible ?? null,
      paidAt: paid?.at ?? null,
      photo,
      platePhoto: str(item.plate_image),
    } satisfies NovaTicketRow,
  ];
}

/** Historial de tiquetes, paginado por Nova Parking (10 por pagina hoy). */
export function getTickets(client: NovaParkingClient, filters: TicketFilters = {}) {
  return read(
    client,
    '/api/parking/ticket/',
    {
      page: filters.page ?? 1,
      plate: filters.plate || undefined,
      status: filters.status || undefined,
      vehicle_type: filters.vehicleType || undefined,
      from_date: filters.fromDate || undefined,
      to_date: finDelDia(filters.toDate || undefined),
    },
    'tickets',
    (raw) => {
      const d = isDict(raw) ? raw : {};
      const rows = list(d.tickets).flatMap(parseTicketRow);
      return { total: num(d.count) ?? rows.length, rows } satisfies NovaTicketPage;
    },
  );
}

/** Un tiquete con todo su recorrido. */
export function getTicket(client: NovaParkingClient, id: string) {
  return read(
    client,
    `/api/parking/ticket/${encodeURIComponent(id)}/`,
    {},
    'ticket',
    (raw) => parseTicketRow(raw)[0] ?? null,
  );
}

function parseCashBox(item: unknown): NovaCashBox[] {
  if (!isDict(item)) return [];
  const id = str(item.id);
  if (!id) return [];
  return [
    {
      id,
      name: str(item.name) ?? `Caja ${id}`,
      status: str(item.status) ?? 'CLOSE',
      responsibleName: str(item.responsibleName),
      openedAt: str(item.open),
      closedAt: str(item.close),
      lastUsedAt: str(item.lastUsed),
      automatic: item.automatic === true,
    } satisfies NovaCashBox,
  ];
}

/** Las cajas del parqueadero, con cual esta abierta y quien la tiene. */
export function getCashBoxes(client: NovaParkingClient) {
  return read(client, '/api/pos/', {}, 'cashBoxes', (raw) =>
    list(raw).flatMap(parseCashBox),
  );
}

/**
 * Una caja con sus movimientos.
 *
 * Nova Parking devuelve TODOS los movimientos desde siempre, sin paginar ni
 * filtrar por fecha (se le pidio corregir en REQUERIMIENTOS_PANEL_ADMIN.md 4.2).
 * Mientras tanto se recorta aqui: mostrar diez mil filas no ayuda a nadie y
 * hace pesada la pagina.
 */
export function getCashBox(client: NovaParkingClient, id: string, limit = 200) {
  return read(
    client,
    `/api/pos/${encodeURIComponent(id)}/`,
    {},
    'cashBox',
    (raw) => {
      const d = isDict(raw) ? raw : {};
      const base = parseCashBox(d)[0];
      if (!base) return null;

      const movements = list(d.logs)
        .flatMap((item) => {
          if (!isDict(item)) return [];
          const movementId = str(item.id);
          const kind = str(item.log_type);
          if (!movementId || !kind) return [];
          return [
            {
              id: movementId,
              kind,
              at: str(item.timestamp),
              responsible: str(item.responsible_name) ?? str(item.responsible),
              ticketId: str(item.ticket),
              amount:
                num(item.ticket_cash) ??
                num(item.monthly_cash) ??
                num(item.miscellaneous_cash),
              cashAfter: num(item.cashAvailable),
              comment: str(item.comment),
            } satisfies NovaCashMovement,
          ];
        })
        .slice(0, limit);

      return {
        ...base,
        cashAvailable: num(d.cashAvailable),
        movements,
      } satisfies NovaCashBoxDetail;
    },
  );
}

/* --------------------------------------------------------------- Reportes */

export type ReportKind =
  | 'daily'
  | 'monthly'
  | 'consolidated'
  | 'detailed-transactions';

/**
 * Reportes, tal como los devuelve Nova Parking.
 *
 * No se normalizan a un tipo propio a proposito: cada reporte tiene su forma, el
 * administrador los descarga tal cual, y forzarlos a un molde comun solo
 * perderia columnas. La tabla y el CSV se arman desde las llaves que vengan.
 */
export function getReport(
  client: NovaParkingClient,
  kind: ReportKind,
  filters: Record<string, string | undefined>,
) {
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) query[key] = key === 'to_date' ? finDelDia(value) : value;
  }
  return read(client, `/api/reports/${kind}/`, query, `report:${kind}`, (raw) => raw);
}

/** Volcado sin paginar para generar el archivo de descarga. */
export function getTicketsExport(
  client: NovaParkingClient,
  filters: TicketFilters = {},
) {
  return read(
    client,
    '/api/parking/ticket/export/',
    {
      status: filters.status || undefined,
      vehicle_type: filters.vehicleType || undefined,
      from_date: filters.fromDate || undefined,
      to_date: finDelDia(filters.toDate || undefined),
    },
    'ticketsExport',
    (raw) => {
      const d = isDict(raw) ? raw : {};
      return list(d.tickets).flatMap(parseTicketRow);
    },
  );
}
