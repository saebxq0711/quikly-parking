import { getCurrentUser } from '@/lib/auth/guards';
import { fotoPermitida, respuestaDeFoto } from '@/lib/parking/vehicle-photo';

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
  /*
    El parqueadero sale de la sesion (ya trae su slug): sin otra consulta a la base.
    Cada foto cuenta, porque una galeria son 11 a la vez y la base atiende con una
    sola conexion por instancia. 404 y no 403: no se confirma que exista un
    parqueadero ajeno.
  */
  if (
    user.role !== 'ADMIN_PARQUEADERO' ||
    !user.parkingLotId ||
    user.parkingLot?.slug !== slug
  ) {
    return new Response(null, { status: 404 });
  }

  // El historial pide una foto por fila y cada galeria hasta 11: 600 por minuto
  // son muchas paginas seguidas. Se cuenta en memoria (ver `fotoPermitida`).
  if (!fotoPermitida(`foto-panel:${user.id}`, 600)) {
    return new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const src = new URL(request.url).searchParams.get('src') ?? '';
  return respuestaDeFoto(user.parkingLotId, src);
}
