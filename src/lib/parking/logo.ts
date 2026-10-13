/**
 * Logo de cada parqueadero (2026-10-13).
 *
 * Va donde estaba el de Quikly Parking: en la barra del panel del administrador y en el
 * encabezado del kiosco. Sin logo propio se sigue viendo el de Quikly. Lo sube el
 * SuperAdmin desde la ficha del parqueadero.
 *
 * Se guarda en la base (`ParkingLotLogo`) y no en `public/`: cada parqueadero tiene el
 * suyo y se cambia sin desplegar. El navegador lo achica antes de subirlo
 * (`logo-card.tsx`), asi que pesa poco y la ruta que lo sirve lo deja guardado en el
 * navegador hasta que cambie (`logoUpdatedAt` va en la URL).
 */

/** Tope del archivo ya achicado. Un logo de 512 px en WebP pesa 20-80 KB. */
export const LOGO_MAX_BYTES = 700 * 1024;

/** Formatos aceptados. SVG no: puede llevar codigo, y se serviria desde nuestro dominio. */
const FIRMAS: { mime: string; coincide: (b: Uint8Array) => boolean }[] = [
  {
    mime: 'image/png',
    coincide: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/jpeg', coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    coincide: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  },
];

/**
 * Tipo real de la imagen, por sus primeros bytes y no por lo que diga el navegador.
 * `null` si no es PNG, JPEG ni WebP.
 */
export function tipoDeImagen(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return FIRMAS.find((f) => f.coincide(bytes))?.mime ?? null;
}

/** URL del logo de un parqueadero, o `null` si no tiene (se usa el de Quikly). */
export function logoUrl(lot: { id: string; logoUpdatedAt: Date | null }): string | null {
  if (!lot.logoUpdatedAt) return null;
  return `/api/logo/${lot.id}?v=${lot.logoUpdatedAt.getTime()}`;
}
