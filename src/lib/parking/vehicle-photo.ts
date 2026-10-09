import { novaClientFor } from './config';

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
  if (/^\/api\/parking\/ticket\/\d+\/foto\/$/.test(src)) return true;
  return src.startsWith('/media/') && !src.includes('..');
}

export async function respuestaDeFoto(
  parkingLotId: string,
  src: string,
): Promise<Response> {
  if (!esRutaDeFoto(src)) return new Response(null, { status: 400 });

  try {
    const client = await novaClientFor(parkingLotId);
    const { bytes, contentType } = await client.media(src);
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        // La foto de una entrada ya ocurrida no cambia nunca. Privada: es de
        // este parqueadero y de nadie mas, asi que no la guarda ningun
        // intermediario, solo el navegador que la pidio.
        'Cache-Control': 'private, max-age=86400, immutable',
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    // Sin foto, con `/media/` cerrada o sin conexion: para la pantalla es lo mismo.
    return new Response(null, { status: 404 });
  }
}
