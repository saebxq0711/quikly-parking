import { hash, verify } from '@node-rs/argon2';

/**
 * Hashing de contrasenas con Argon2id, el algoritmo recomendado por OWASP.
 * Nunca se almacena ni se registra la contrasena en claro (CLAUDE.md seccion 10).
 *
 * Parametros: perfil de memoria moderada (19 MiB) recomendado por OWASP para
 * aplicaciones web interactivas; el login debe seguir siendo rapido en el
 * kiosco del punto de pago.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    // Un hash corrupto o de otro algoritmo no debe tumbar el login:
    // se trata como credencial invalida.
    return false;
  }
}

/**
 * Reglas minimas de contrasena. Se validan en el servidor; el frontend solo
 * las repite para dar retroalimentacion (CLAUDE.md seccion 25).
 */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 10) {
    return 'La contrasena debe tener al menos 10 caracteres.';
  }
  if (!/[a-z]/.test(plain) || !/[A-Z]/.test(plain)) {
    return 'La contrasena debe combinar mayusculas y minusculas.';
  }
  if (!/\d/.test(plain)) {
    return 'La contrasena debe incluir al menos un numero.';
  }
  return null;
}
