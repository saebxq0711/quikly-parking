import { AppError } from '@/lib/errors';
import { parseUpstreamDate } from '@/lib/parking/tickets-view';
import type { NovaParkingClient } from './client';
import { ticketPhotoPath } from './normalize';

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
  /**
   * Foto de la camara de salida, cuando el sistema la tomo (desde el
   * 2026-10-09). Los tiquetes que salieron antes no la tienen ni la van a tener.
   */
  exitPhoto: string | null;
  /** Segunda camara: el plano cerrado de la placa, cuando existe. */
  platePhoto: string | null;
  /**
   * TODAS las fotos del tiquete, de entrada y de salida, con la camara que tomo
   * cada una. `photo` y `exitPhoto` son la primera de cada tipo.
   */
  photos: TicketPhoto[];
}

/** Una foto del tiquete, lista para pedirla por el proxy. */
export interface TicketPhoto {
  /** Ruta en el sistema del parqueadero (`/api/parking/ticket/<id>/foto/...`). */
  src: string;
  kind: 'entrada' | 'salida';
  /** Que camara la tomo: "Camara principal", "Camara de apoyo .160"... */
  camera: string;
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

  const { photo, exitPhoto, photos } = ticketPhotos(id, item);

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
      exitPhoto,
      platePhoto: str(item.plate_image),
      photos,
    } satisfies NovaTicketRow,
  ];
}

/**
 * Que camara tomo una foto, por el nombre del archivo que pone Nova Parking:
 *   camera_192.168.18.130_*   la camara principal (entrada .130, salida .140)
 *   apoyo_192.168.18.160_*    una camara de apoyo (entrada .160/.170/.233,
 *                             salida .150/.210/.220)
 *   exit_image_0_*            el recorte que manda la camara de placas en su
 *                             evento: pequeno (unos 6 KB), va al final
 * Visto en el 122 el 2026-10-12. El orden deja primero la principal: es la que
 * se muestra de entrada.
 */
function camaraDe(ruta: string): { nombre: string; orden: number } {
  const archivo = ruta.split('/').pop() ?? '';
  const ip = archivo.match(/\d+\.\d+\.\d+\.(\d+)/);
  if (/^camera_/i.test(archivo)) return { nombre: 'Cámara principal', orden: 0 };
  if (/^apoyo_/i.test(archivo)) {
    return { nombre: `Cámara de apoyo${ip ? ` .${ip[1]}` : ''}`, orden: 1 };
  }
  if (/^exit_image_/i.test(archivo)) return { nombre: 'Recorte de la cámara de placas', orden: 2 };
  return { nombre: 'Cámara', orden: 1 };
}

/**
 * Las fotos de un tiquete.
 *
 * Nova Parking las guarda en dos campos del tiquete (`front_image`, `plate_image`)
 * y en una lista aparte (`images`): desde el 2026-10-12 son varias por paso, la
 * camara principal y las de apoyo, de entrada y de salida (`image_type`: ENTRY /
 * EXIT). El orden de la lista no esta garantizado: se filtra por tipo.
 *
 * COMO SE PIDE CADA UNA. Si cada foto de la lista trae su `id`, se pide esa foto
 * exacta (`?imagen=<id>`) y se ven todas. Si no lo trae (el servidor hoy solo
 * entrega una por tipo), se pide una por tipo (`?tipo=entrada` / `?tipo=salida`),
 * como antes. Asi, el dia que Nova Parking publique cada foto por su id, aparecen
 * todas sin tocar nada aqui. La de salida solo se pide si el tiquete dice tenerla:
 * no se gasta una peticion en un 404 seguro.
 */
function ticketPhotos(
  id: string,
  item: Record<string, unknown>,
): { photo: string | null; exitPhoto: string | null; photos: TicketPhoto[] } {
  const galeria = list(item.images).flatMap((foto) => {
    if (!isDict(foto) || !str(foto.image)) return [];
    const ruta = str(foto.image) as string;
    const imagenId = str(foto.id);
    return [{
      ruta,
      tipo: str(foto.image_type)?.toUpperCase() ?? null,
      imagenId: imagenId && /^\d+$/.test(imagenId) ? imagenId : null,
      camara: camaraDe(ruta),
    }];
  });
  const idValido = /^\d+$/.test(id);

  // Una por una, cuando el servidor dice el id de cada foto.
  if (idValido && galeria.length > 0 && galeria.every((foto) => foto.imagenId && foto.tipo)) {
    const photos = galeria
      .map((foto) => ({
        src: `/api/parking/ticket/${id}/foto/?imagen=${foto.imagenId}`,
        kind: foto.tipo === 'EXIT' ? ('salida' as const) : ('entrada' as const),
        camera: foto.camara.nombre,
        orden: foto.camara.orden,
      }))
      .sort((a, b) => Number(a.kind === 'salida') - Number(b.kind === 'salida') || a.orden - b.orden)
      .map(({ orden: _orden, ...foto }) => foto);
    return {
      photo: photos.find((f) => f.kind === 'entrada')?.src ?? null,
      exitPhoto: photos.find((f) => f.kind === 'salida')?.src ?? null,
      photos,
    };
  }

  // Una por tipo: lo que el servidor entrega hoy.
  const conTipo = galeria.some((foto) => foto.tipo !== null);
  const primeraEntrada = galeria.find((foto) => foto.tipo !== 'EXIT');
  const primeraSalida = galeria.find((foto) => foto.tipo === 'EXIT');
  const entradaOriginal = str(item.front_image) ?? primeraEntrada?.ruta ?? null;

  const photo = conTipo && entradaOriginal && idValido
    ? `/api/parking/ticket/${id}/foto/?tipo=entrada`
    : ticketPhotoPath(id, entradaOriginal);
  const exitPhoto = primeraSalida && idValido ? `/api/parking/ticket/${id}/foto/?tipo=salida` : null;

  const photos: TicketPhoto[] = [];
  if (photo) {
    photos.push({ src: photo, kind: 'entrada', camera: primeraEntrada ? camaraDe(primeraEntrada.ruta).nombre : 'Cámara de entrada' });
  }
  if (exitPhoto && primeraSalida) {
    photos.push({ src: exitPhoto, kind: 'salida', camera: camaraDe(primeraSalida.ruta).nombre });
  }
  return { photo, exitPhoto, photos };
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
export function getCashBox(client: NovaParkingClient, id: string, limit = 1000) {
  return read(
    client,
    `/api/pos/${encodeURIComponent(id)}/`,
    {},
    'cashBox',
    (raw) => {
      const d = isDict(raw) ? raw : {};
      const base = parseCashBox(d)[0];
      if (!base) return null;

      const movements: NovaCashMovement[] = list(d.logs)
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
        /*
          Del mas reciente al mas antiguo, y ORDENADO ANTES DE RECORTAR: Nova
          Parking devuelve todos los movimientos desde siempre y aqui solo caben
          `limit`. Recortando sin ordenar se corria el riesgo de mostrar los
          doscientos primeros de la historia de la caja en vez de los ultimos
          doscientos, que es lo unico que alguien va a mirar.
        */
        .sort((a, b) => {
          const A = parseUpstreamDate(a.at)?.getTime() ?? 0;
          const B = parseUpstreamDate(b.at)?.getTime() ?? 0;
          return B - A;
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
