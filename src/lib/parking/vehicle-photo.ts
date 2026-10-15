import { MemoryWindow } from '@/lib/security/memory-window';
import { novaClientForPhotos } from './config';

/**
 * Limite de fotos por usuario, en memoria (no en la base): ver `contadorFotos` en
 * el freno de Nova Parking. Lo que corta es un bucle, no a una persona mirando.
 */
const fotosPorUsuario = new MemoryWindow(5_000);

export function fotoPermitida(clave: string, limitePorMinuto: number): boolean {
  return fotosPorUsuario.hit(clave, 60_000).count <= limitePorMinuto;
}

/**
 * Foto de la entrada de un vehiculo, traida del sistema del parqueadero.
 *
 * Las camaras fotografian cada vehiculo al entrar y Nova Parking guarda la
 * imagen junto al tiquete. El navegador no puede ir a buscarla: la foto vive
 * detras del tunel y ese lado solo se habla con el token compartido, que jamas
 * sale del servidor (CLAUDE.md seccion 9). Asi que el servidor la baja y la
 * reenvia.
 *
 * Lo usan dos pantallas con permisos distintos —el panel del administrador y el
 * kiosco— y por eso vive aqui: cada ruta resuelve QUIEN puede pedirla, esto
 * resuelve COMO se trae. La validacion de la ruta se repite en los dos sitios a
 * proposito; es la que impide que esto se convierta en un proxy abierto.
 *
 * Desde el 2026-10-09 Nova Parking publica la foto de cada tiquete en
 * `/api/parking/ticket/<id>/foto/`, con token; `/media/` sigue cerrada en el
 * tunel. Sin foto o sin conexion, las pantallas muestran "sin foto" en vez de
 * romperse.
 */

/**
 * Rutas aceptables: la foto de un tiquete por su id (la que publica el tunel) o
 * la ruta `/media/` que trae el tiquete. Nada mas: esto es lo que impide que el
 * proxy sirva para pedir cualquier otra ruta del sistema del parqueadero.
 */
export function esRutaDeFoto(src: string): boolean {
  if (/^\/api\/parking\/ticket\/\d+\/foto\/(\?(tipo=(entrada|salida)|imagen=\d+))?$/.test(src)) return true;
  return src.startsWith('/media/') && !src.includes('..');
}

/**
 * Achica la foto para una pantalla (2026-10-15). La camara la entrega completa, unos
 * 700 KB, y en el kiosco tardaba tanto en llegar que el cliente seguia con el pago sin
 * haberla visto. A 960 px de ancho pesa ~10 veces menos y se ve igual en la pantalla.
 * Si no se puede achicar (formato raro, sin `sharp`), se entrega la original.
 */
async function achicar(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  anchoMax: number,
): Promise<{ bytes: ArrayBuffer | Uint8Array; contentType: string }> {
  if (!/^image\/(jpe?g|png|webp)/i.test(contentType)) return { bytes, contentType };
  try {
    const { default: sharp } = await import('sharp');
    const salida = await sharp(Buffer.from(bytes as ArrayBuffer))
      .rotate()
      .resize({ width: anchoMax, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    return { bytes: new Uint8Array(salida), contentType: 'image/jpeg' };
  } catch {
    return { bytes, contentType };
  }
}

export async function respuestaDeFoto(
  parkingLotId: string,
  src: string,
  opciones: { anchoMax?: number } = {},
): Promise<Response> {
  if (!esRutaDeFoto(src)) return new Response(null, { status: 400 });

  try {
    const client = await novaClientForPhotos(parkingLotId);
    const original = await client.media(src);
    const { bytes, contentType } = opciones.anchoMax
      ? await achicar(original.bytes, original.contentType, opciones.anchoMax)
      : original;
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': contentType,
        /*
          Privada: es de este parqueadero y de nadie mas, asi que no la guarda
          ningun intermediario, solo el navegador que la pidio.

          Solo la foto pedida por su id (`?imagen=`) es fija y se guarda un dia.
          Las de `?tipo=` CAMBIAN: el servidor entrega la mas reciente de ese tipo,
          y un vehiculo que vuelve a salir, o las camaras de apoyo que llegan
          segundos despues, cambian cual es. Guardadas un dia "immutable", el
          navegador seguia mostrando la vieja: parecia la foto de otro vehiculo.
        */
        'Cache-Control': /[?&]imagen=\d+$/.test(src)
          ? 'private, max-age=86400, immutable'
          : 'private, max-age=60',
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    // Sin foto, con `/media/` cerrada o sin conexion: para la pantalla es lo mismo.
    return new Response(null, { status: 404 });
  }
}
