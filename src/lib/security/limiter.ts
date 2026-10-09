import { db } from '../db';
import { MemoryWindow } from './memory-window';

/**
 * Limitador de peticiones COMPARTIDO entre todas las instancias.
 *
 * El contador vive en la base (`rate_limit_buckets`) y se suma con un solo
 * INSERT ... ON CONFLICT atomico: dos instancias que cuentan a la vez no se
 * pisan, y un atacante no esquiva el limite repartiendo peticiones entre
 * instancias de Vercel, que era el hueco del limitador en memoria.
 *
 * Si la base falla (o la tabla aun no existe porque no se corrio la migracion)
 * se cuenta en memoria: un limite parcial es mejor que ninguno, y una caida del
 * limitador no debe tumbar el login ni el kiosco.
 */

export interface HitResult {
  count: number;
  resetAt: Date;
}

const respaldo = new MemoryWindow();
let avisado = false;

/*
  Las fechas viajan como texto ISO y se convierten a `timestamp(3)`, el tipo en
  que Prisma guarda los DateTime (UTC sin zona). Comparar contra `now()` (con
  zona) dependeria de la zona horaria de la sesion de la base.
*/
const iso = (fecha: Date) => fecha.toISOString();

/** Suma `weight` a la llave dentro de una ventana de `windowMs`. */
export async function hit(key: string, windowMs: number, weight = 1): Promise<HitResult> {
  const ahora = new Date();
  const reinicio = new Date(ahora.getTime() + windowMs);

  try {
    const filas = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt")
      VALUES (${key}, ${weight}, CAST(${iso(reinicio)} AS timestamp(3)))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_buckets"."resetAt" <= CAST(${iso(ahora)} AS timestamp(3))
          THEN ${weight}
          ELSE "rate_limit_buckets"."count" + ${weight}
        END,
        "resetAt" = CASE
          WHEN "rate_limit_buckets"."resetAt" <= CAST(${iso(ahora)} AS timestamp(3))
          THEN EXCLUDED."resetAt"
          ELSE "rate_limit_buckets"."resetAt"
        END
      RETURNING "count", "resetAt"`;
    const fila = filas[0];
    if (fila) {
      // `timestamp` sin zona llega como fecha local del proceso: se reinterpreta como UTC.
      const resetAt = new Date(fila.resetAt);
      return { count: Number(fila.count), resetAt };
    }
  } catch (error) {
    if (!avisado) {
      avisado = true;
      console.error('[security] limitador compartido no disponible; se cuenta en memoria', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const local = respaldo.hit(key, windowMs, weight);
  return { count: local.count, resetAt: new Date(local.resetAt) };
}

/** Borra el contador de una llave (por ejemplo, tras un login correcto). */
export async function resetKey(key: string): Promise<void> {
  respaldo.reset(key);
  try {
    await db.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "key" = ${key}`;
  } catch {
    // Sin la tabla no hay nada que borrar.
  }
}

/** Borra las ventanas vencidas. La llama la tarea programada diaria. */
export async function purgeExpiredBuckets(): Promise<number> {
  const corte = new Date(Date.now() - 60 * 60_000);
  try {
    return await db.$executeRaw`
      DELETE FROM "rate_limit_buckets" WHERE "resetAt" < CAST(${iso(corte)} AS timestamp(3))`;
  } catch {
    return 0;
  }
}
