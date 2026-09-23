import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { respuestaDeFoto } from '@/lib/parking/vehicle-photo';

export const runtime = 'nodejs';

/**
 * Foto de la entrada de un vehiculo para el panel del administrador.
 *
 * Aqui solo se resuelve QUIEN puede pedirla: el administrador de ESTE
 * parqueadero y nadie mas (aislamiento, CLAUDE.md seccion 18). Como se trae la
 * imagen —con el token, por el tunel— vive en `lib/parking/vehicle-photo.ts`,
 * porque el kiosco tiene su propia ruta con permisos distintos.
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
  return respuestaDeFoto(lot.id, src);
}
