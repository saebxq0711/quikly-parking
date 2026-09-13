import crypto from 'node:crypto';

/**
 * El token del enlace de restablecimiento se guarda hasheado.
 *
 * SHA-256 sin sal y sin factor de trabajo, a diferencia de las contrasenas: son
 * 32 bytes aleatorios, no algo que una persona pudo elegir. No hay diccionario
 * que adivinarlos, asi que Argon2 aqui solo costaria tiempo en cada intento.
 *
 * Lo que si aporta hashearlo: quien logre leer la tabla `password_reset_requests`
 * no obtiene enlaces utilizables.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
