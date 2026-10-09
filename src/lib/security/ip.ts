/**
 * IP del cliente de una peticion.
 *
 * En Vercel las cabeceras `x-vercel-forwarded-for` y `x-real-ip` las pone el
 * propio Vercel y sobrescribe lo que mande el cliente, asi que son confiables.
 * `x-forwarded-for` se usa como ultimo recurso (desarrollo local, otro proxy):
 * ahi el cliente podria falsificarla, por eso va de ultima.
 *
 * No importa nada del servidor: la usan el middleware y las rutas por igual.
 */
export function clientIp(headers: Headers): string | null {
  const candidata =
    headers.get('x-vercel-forwarded-for')?.split(',')[0] ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0] ??
    null;
  return normalizeIp(candidata);
}

/**
 * Forma canonica de una IP para compararla y guardarla: sin espacios, sin
 * puerto, IPv4 mapeada en IPv6 (`::ffff:1.2.3.4`) como IPv4, y en minusculas.
 * Devuelve null si no parece una IP: no se guarda basura que vino en una cabecera.
 */
export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim().toLowerCase();
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']'));
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  // IPv4 con puerto: "1.2.3.4:5678".
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(':')[0];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every((parte) => Number(parte) <= 255) ? ip : null;
  }
  if (/^[0-9a-f:]{2,39}$/.test(ip) && ip.includes(':')) return ip;
  return null;
}

/** IPs que nunca se bloquean: `SECURITY_ALLOWLIST_IPS`, separadas por comas. */
export function isAllowlisted(ip: string | null): boolean {
  if (!ip) return false;
  const lista = (process.env.SECURITY_ALLOWLIST_IPS ?? '')
    .split(',')
    .map((item) => normalizeIp(item))
    .filter(Boolean);
  return lista.includes(ip);
}
