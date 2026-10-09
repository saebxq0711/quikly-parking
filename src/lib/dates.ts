/**
 * Fechas de negocio en hora de Colombia.
 *
 * El servidor (Vercel) corre en UTC: `toISOString().slice(0, 10)` o
 * `new Date('2026-10-02T00:00:00')` sin zona dan el dia de Londres, no el de
 * Bogota. Un cobro a las 8 p. m. salia facturado con fecha del dia siguiente.
 * Colombia no tiene horario de verano, asi que el desfase es siempre -05:00.
 */

const ZONA = 'America/Bogota';
const DESFASE = '-05:00';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia calendario en Bogota, como `YYYY-MM-DD`. */
export function diaEnBogota(fecha: Date = new Date()): string {
  return formatoDia.format(fecha);
}

/** True si el texto es un dia `YYYY-MM-DD` que existe en el calendario. */
export function esDiaValido(dia: string | undefined | null): dia is string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const fecha = new Date(`${dia}T12:00:00${DESFASE}`);
  return !Number.isNaN(fecha.getTime()) && diaEnBogota(fecha) === dia;
}

/** Primer instante de ese dia en Bogota. */
export function inicioDelDia(dia: string): Date {
  return new Date(`${dia}T00:00:00${DESFASE}`);
}

/** Ultimo instante de ese dia en Bogota (para filtros `hasta` inclusivos). */
export function finDelDia(dia: string): Date {
  return new Date(`${dia}T23:59:59.999${DESFASE}`);
}
