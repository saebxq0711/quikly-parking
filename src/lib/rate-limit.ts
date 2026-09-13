import { AppError } from './errors';

/**
 * Limitador de intentos para endpoints sensibles (CLAUDE.md seccion 25).
 *
 * Implementacion en memoria del proceso: suficiente para un despliegue de una
 * sola instancia y para desarrollo. Al escalar a varias instancias hay que
 * moverlo a un almacen compartido (Redis) — la interfaz `consume` no cambia.
 *
 * El bloqueo de cuenta por intentos fallidos de login NO depende de esto: vive
 * en la base de datos (`users.failedLoginCount` / `lockedUntil`), asi que
 * funciona correctamente aunque haya varias instancias.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Limpia entradas vencidas de vez en cuando para no crecer sin limite. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Identificador del cubo: normalmente `accion:ip` o `accion:usuario`. */
  key: string;
  limit: number;
  windowMs: number;
}

/**
 * Consume un intento. Lanza AppError('RATE_LIMITED') si se supero el limite.
 */
export function consumeRateLimit(options: RateLimitOptions): void {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(options.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > options.limit) {
    const seconds = Math.ceil((existing.resetAt - now) / 1000);
    throw new AppError('RATE_LIMITED', {
      publicMessage: `Demasiados intentos. Espera ${seconds} segundos e intenta de nuevo.`,
      detail: { key: options.key, count: existing.count },
    });
  }
}

/** Reinicia el contador tras una operacion exitosa (ej. login correcto). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
