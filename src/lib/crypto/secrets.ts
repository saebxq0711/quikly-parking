import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../env';

/**
 * Cifrado de credenciales guardadas en base de datos (AES-256-GCM).
 *
 * Las credenciales de Redeban, SIIGO y Nova Parking nunca se guardan en claro
 * ni se devuelven al navegador. El SuperAdmin puede escribirlas y ver una
 * mascara, pero no leerlas de vuelta desde la interfaz.
 *
 * Formato almacenado: `v1.<iv_b64>.<tag_b64>.<ciphertext_b64>`
 * El prefijo de version permite rotar el algoritmo mas adelante sin ambiguedad.
 */

const VERSION = 'v1';
const IV_BYTES = 12; // recomendado para GCM
const KEY_BYTES = 32;

function loadKey(): Buffer {
  const key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY debe ser de ${KEY_BYTES} bytes en base64. ` +
        'Generar con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Formato de secreto invalido o version desconocida.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    loadKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Representacion segura de un secreto para mostrar en la interfaz.
 * Solo revela la longitud aproximada y los ultimos caracteres.
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 4) return '****';
  return `${'*'.repeat(Math.min(plaintext.length - 4, 20))}${plaintext.slice(-4)}`;
}

/**
 * Comparacion en tiempo constante, para tokens compartidos y webhooks.
 * Evita filtrar informacion por diferencias de tiempo de respuesta.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
