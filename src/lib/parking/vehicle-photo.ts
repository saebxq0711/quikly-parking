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

export async function respuestaDeFoto(
  parkingLotId: string,
  src: string,
): Promise<Response> {
  if (!esRutaDeFoto(src)) return new Response(null, { status: 400 });

  try {
    const client = await novaClientForPhotos(parkingLotId);
    const { bytes, contentType } = await client.media(src);
    return new Response(bytes, {
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
