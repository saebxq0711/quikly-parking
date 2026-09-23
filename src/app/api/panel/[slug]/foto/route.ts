import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { novaClientFor } from '@/lib/parking/config';

export const runtime = 'nodejs';

/**
 * Foto de la entrada de un vehiculo, traida del sistema del parqueadero.
 *
 * Las camaras del parqueadero fotografian cada vehiculo al entrar y Nova Parking
 * guarda esa imagen junto al tiquete. El navegador del administrador no puede ir
 * a buscarla: la foto vive detras del tunel y ese lado solo se habla con el token
 * compartido, que jamas sale del servidor (CLAUDE.md seccion 9). Asi que esta
 * ruta la baja con el token y la reenvia.
 *
 * Se exige:
 *   - sesion de administrador DE ESTE parqueadero (aislamiento, seccion 18);
 *   - que la ruta pedida sea una de las del propio sistema (`/media/...`), que es
 *     como llega dentro del tiquete. No se acepta una URL completa: si se
 *     aceptara, esta ruta se convertiria en un proxy abierto a cualquier destino.
 *
 * PENDIENTE DEL OTRO LADO: hoy `/media/` esta cerrado en el tunel a proposito
 * (`docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md`), asi que esto responde 404
 * hasta que Nova Parking publique esa ruta. El panel lo muestra como "sin foto"
 * en vez de romperse — ver REQUERIMIENTOS_PANEL_ADMIN.md.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const { slug } = await params;
  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: { id: true },
  });
  // 404 y no 403: no se confirma que exista un parqueadero ajeno.
  if (!lot || user.role !== 'ADMIN_PARQUEADERO' || user.parkingLotId !== lot.id) {
    return new Response(null, { status: 404 });
  }

  const src = new URL(request.url).searchParams.get('src') ?? '';
  if (!src.startsWith('/media/') || src.includes('..')) {
    return new Response(null, { status: 400 });
  }

  try {
    const client = await novaClientFor(lot.id);
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
    // Sin foto, con `/media/` cerrado o sin conexion: para el panel es lo mismo.
    return new Response(null, { status: 404 });
  }
}
