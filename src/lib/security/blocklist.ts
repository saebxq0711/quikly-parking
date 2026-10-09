import { db } from '../db';
import { isAllowlisted, normalizeIp } from './ip';
import { hit } from './limiter';
import { MemoryWindow } from './memory-window';

/**
 * Bloqueo de IPs.
 *
 * Cada comportamiento sospechoso suma "faltas" a la IP: buscar rutas de
 * escaneo (`/.env`, `/wp-login.php`), superar un limite de peticiones, fallar
 * el inicio de sesion, mandar peticiones desde otro sitio. Al llegar a
 * STRIKE_THRESHOLD faltas en una hora, la IP queda bloqueada, y cada
 * reincidencia dura mas: 15 min, 1 h, 6 h, 1 dia, 7 dias.
 *
 * El SuperAdmin ve, bloquea y desbloquea desde /admin/seguridad. Las IPs de
 * `SECURITY_ALLOWLIST_IPS` nunca se bloquean.
 *
 * La lista activa se cachea 15 s por instancia: revisar el bloqueo en cada
 * peticion no puede costar una consulta cada vez.
 */

export const STRIKE_THRESHOLD = 10;
const STRIKE_WINDOW_MS = 60 * 60_000;
/** Duracion de cada bloqueo automatico segun las veces que la IP reincidio. */
const ESCALA_MINUTOS = [15, 60, 6 * 60, 24 * 60, 7 * 24 * 60];
const CACHE_MS = 15_000;

/** Peso de cada falta. Lo claramente malicioso pesa mas. */
export const STRIKE = {
  /** Ruta que solo pide un escaner: /.env, /wp-login.php, /.git... */
  TRAP: 4,
  /** Herramienta de ataque declarada en el User-Agent (sqlmap, nikto...). */
  BAD_AGENT: 5,
  /** Peticion de escritura desde otro sitio web (CSRF) o sin origen. */
  BAD_ORIGIN: 3,
  /** Supero un limite de peticiones. */
  RATE_LIMIT: 2,
  /** Usuario o contrasena incorrectos. */
  LOGIN_FAILED: 1,
  /** Enlace de comprobante o de restablecimiento que no existe. */
  BAD_TOKEN: 1,
} as const;

export type StrikeKind = keyof typeof STRIKE;

/* -------------------------------------------------------------- Cache */

/*
  El estado vive en `globalThis` y no en variables del modulo: el middleware y
  las rutas se empaquetan por separado y cada paquete tendria su propia copia.
  Sin esto, una IP bloqueada desde una ruta (login, factura) seguia pasando el
  middleware hasta que su copia de la cache se refrescara.
*/
interface EstadoBloqueos {
  activos: Map<string, number> | null;
  cargadoEn: number;
  cargando: Promise<Map<string, number>> | null;
}
const estado: EstadoBloqueos = ((globalThis as { __bloqueosIp?: EstadoBloqueos }).__bloqueosIp ??= {
  activos: null,
  cargadoEn: 0,
  cargando: null,
});

async function cargarActivos(): Promise<Map<string, number>> {
  const ahora = new Date();
  const filas = await db.blockedIp.findMany({
    where: { OR: [{ permanent: true }, { blockedUntil: { gt: ahora } }] },
    select: { ip: true, permanent: true, blockedUntil: true },
  });
  return new Map(
    filas.map((fila) => [fila.ip, fila.permanent ? Infinity : fila.blockedUntil.getTime()]),
  );
}

async function listaActiva(): Promise<Map<string, number>> {
  if (estado.activos && Date.now() - estado.cargadoEn < CACHE_MS) return estado.activos;
  estado.cargando ??= cargarActivos()
    .then((mapa) => {
      estado.activos = mapa;
      estado.cargadoEn = Date.now();
      return mapa;
    })
    .catch((error) => {
      // Sin la tabla o sin base: no se bloquea a nadie, pero se sigue funcionando.
      console.error('[security] no se pudo leer la lista de IPs bloqueadas', {
        error: error instanceof Error ? error.message : String(error),
      });
      estado.activos ??= new Map();
      estado.cargadoEn = Date.now();
      return estado.activos;
    })
    .finally(() => {
      estado.cargando = null;
    });
  return estado.cargando;
}

/** True si la IP esta bloqueada en este momento. */
export async function isIpBlocked(ip: string | null): Promise<boolean> {
  if (!ip || isAllowlisted(ip)) return false;
  const hasta = (await listaActiva()).get(ip);
  return hasta !== undefined && hasta > Date.now();
}

/* ----------------------------------------------------------- Eventos */

const eventosRecientes = new MemoryWindow(10_000);

/**
 * Deja rastro de un evento de seguridad. Bajo una inundacion se guarda uno
 * cada pocos segundos por IP y tipo: el rastro no puede convertirse en la
 * forma de llenar la base.
 */
export async function recordSecurityEvent(event: {
  ip: string | null;
  kind: string;
  path?: string | null;
  detail?: string | null;
  userId?: string | null;
}): Promise<void> {
  const llave = `${event.ip ?? '-'}|${event.kind}`;
  if (eventosRecientes.hit(llave, 5_000).count > 3) return;

  try {
    await db.securityEvent.create({
      data: {
        ip: event.ip,
        kind: event.kind,
        path: event.path?.slice(0, 300) ?? null,
        detail: event.detail?.slice(0, 500) ?? null,
        userId: event.userId ?? null,
      },
    });
  } catch {
    // Sin la tabla: el evento se pierde, la peticion no.
  }
}

/* ----------------------------------------------------- Faltas y bloqueo */

/**
 * Suma una falta a la IP y la bloquea si llego al umbral. Devuelve true si la
 * IP quedo bloqueada con esta falta.
 */
export async function strike(
  ipCruda: string | null,
  kind: StrikeKind,
  info: { path?: string | null; detail?: string | null } = {},
): Promise<boolean> {
  const ip = normalizeIp(ipCruda);
  if (!ip || isAllowlisted(ip)) return false;

  await recordSecurityEvent({ ip, kind, path: info.path, detail: info.detail });

  const { count } = await hit(`strike:${ip}`, STRIKE_WINDOW_MS, STRIKE[kind]);
  if (count < STRIKE_THRESHOLD || (await isIpBlocked(ip))) return false;

  await blockIp({
    ip,
    reason: `Automatico: ${describirFalta(kind)}`,
    automatic: true,
  });
  return true;
}

function describirFalta(kind: StrikeKind): string {
  switch (kind) {
    case 'TRAP':
      return 'busco rutas de escaneo';
    case 'BAD_AGENT':
      return 'herramienta de ataque';
    case 'BAD_ORIGIN':
      return 'peticiones desde otro sitio';
    case 'RATE_LIMIT':
      return 'demasiadas peticiones';
    case 'LOGIN_FAILED':
      return 'demasiados inicios de sesion fallidos';
    case 'BAD_TOKEN':
      return 'probo enlaces que no existen';
  }
}

/**
 * Bloquea una IP. Sin `minutes` ni `permanent`, la duracion sale de la escala
 * segun sus reincidencias.
 */
export async function blockIp(params: {
  ip: string;
  reason: string;
  automatic: boolean;
  minutes?: number;
  permanent?: boolean;
  actorId?: string | null;
}): Promise<{ until: Date; permanent: boolean } | null> {
  const ip = normalizeIp(params.ip);
  if (!ip || isAllowlisted(ip)) return null;

  const previa = await db.blockedIp.findUnique({ where: { ip }, select: { offenses: true } });
  const offenses = (previa?.offenses ?? 0) + 1;
  const minutos =
    params.minutes ?? ESCALA_MINUTOS[Math.min(offenses - 1, ESCALA_MINUTOS.length - 1)];
  const permanent = params.permanent ?? false;
  const until = new Date(Date.now() + minutos * 60_000);

  await db.blockedIp.upsert({
    where: { ip },
    create: {
      ip,
      reason: params.reason.slice(0, 200),
      blockedUntil: until,
      permanent,
      offenses,
      automatic: params.automatic,
      createdById: params.actorId ?? null,
    },
    update: {
      reason: params.reason.slice(0, 200),
      blockedUntil: until,
      permanent,
      offenses,
      automatic: params.automatic,
      createdById: params.actorId ?? null,
    },
  });

  // Efecto inmediato en esta instancia; las demas lo ven al refrescar la cache.
  (estado.activos ??= new Map()).set(ip, permanent ? Infinity : until.getTime());

  await recordSecurityEvent({
    ip,
    kind: 'BLOCKED',
    detail: `${params.reason} · ${permanent ? 'permanente' : `${minutos} min`} · reincidencia ${offenses}`,
    userId: params.actorId ?? null,
  });
  console.warn('[security] IP bloqueada', { ip, motivo: params.reason, permanent, minutos });

  return { until, permanent };
}

/** Levanta el bloqueo. La fila queda para que una reincidencia dure mas. */
export async function unblockIp(ipCruda: string, actorId: string | null): Promise<boolean> {
  const ip = normalizeIp(ipCruda);
  if (!ip) return false;

  const resultado = await db.blockedIp.updateMany({
    where: { ip },
    data: { blockedUntil: new Date(), permanent: false },
  });
  estado.activos?.delete(ip);
  // Sin esto, la siguiente falta lo volveria a bloquear de inmediato.
  await db.rateLimitBucket.deleteMany({ where: { key: `strike:${ip}` } }).catch(() => undefined);

  await recordSecurityEvent({ ip, kind: 'UNBLOCKED', userId: actorId });
  return resultado.count > 0;
}

/** Depura eventos viejos y bloqueos vencidos hace mucho. Tarea programada diaria. */
export async function purgeOldSecurityData(): Promise<{ eventos: number; bloqueos: number }> {
  const hace90Dias = new Date(Date.now() - 90 * 24 * 60 * 60_000);
  try {
    const [eventos, bloqueos] = await Promise.all([
      db.securityEvent.deleteMany({ where: { createdAt: { lt: hace90Dias } } }),
      // Una IP que lleva 90 dias sin bloquearse empieza de cero.
      db.blockedIp.deleteMany({
        where: { permanent: false, blockedUntil: { lt: hace90Dias } },
      }),
    ]);
    return { eventos: eventos.count, bloqueos: bloqueos.count };
  } catch {
    return { eventos: 0, bloqueos: 0 };
  }
}
