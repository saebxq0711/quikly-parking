import { AppError } from './errors';
import { strike } from './security/blocklist';
import { hit, resetKey } from './security/limiter';

/**
 * Limitador de intentos para endpoints sensibles (CLAUDE.md seccion 25).
 *
 * El contador es COMPARTIDO entre instancias (`security/limiter.ts`, en la
 * base): antes vivia en la memoria de cada proceso, y en Vercel eso dejaba
 * multiplicar el limite repartiendo peticiones entre instancias.
 *
 * Quien supera un limite suma faltas a su IP (`security/blocklist.ts`); si
 * insiste, la IP queda bloqueada.
 *
 * El bloqueo de cuenta por intentos fallidos de login es aparte y vive en la
 * tabla de usuarios (`users.failedLoginCount` / `lockedUntil`).
 */

export interface RateLimitOptions {
  /** Identificador del cubo: normalmente `accion:ip` o `accion:usuario`. */
  key: string;
  limit: number;
  windowMs: number;
  /** IP de quien pide: si se pasa del limite, suma faltas. */
  ip?: string | null;
  /** Ruta, solo para el rastro de seguridad. */
  path?: string | null;
}

/**
 * Consume un intento. Lanza AppError('RATE_LIMITED') si se supero el limite.
 */
export async function consumeRateLimit(options: RateLimitOptions): Promise<void> {
  const { count, resetAt } = await hit(options.key, options.windowMs);
  if (count <= options.limit) return;

  /*
    Una falta al pasarse y otra cada 10 peticiones mas: el que se paso por poco
    no queda bloqueado, el que insiste a la fuerza si.
  */
  const exceso = count - options.limit;
  if (options.ip && exceso % 10 === 1) {
    await strike(options.ip, 'RATE_LIMIT', {
      path: options.path,
      detail: options.key.split(':')[0],
    });
  }

  const seconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  throw new AppError('RATE_LIMITED', {
    publicMessage: `Demasiados intentos. Espera ${seconds} segundos e intenta de nuevo.`,
    detail: { key: options.key, count },
  });
}

/** Reinicia el contador tras una operacion exitosa (ej. login correcto). */
export async function resetRateLimit(key: string): Promise<void> {
  await resetKey(key);
}
