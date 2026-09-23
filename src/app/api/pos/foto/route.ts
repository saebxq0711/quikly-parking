import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { respuestaDeFoto } from '@/lib/parking/vehicle-photo';

export const runtime = 'nodejs';

/**
 * Foto de la entrada del vehiculo para el kiosco.
 *
 * El cliente la ve antes de pagar, para confirmar que el tiquete es el suyo. La
 * trae el servidor con el token del tunel (`lib/parking/vehicle-photo.ts`).
 *
 * El parqueadero NO se toma de la peticion: sale del usuario autenticado, asi
 * que un kiosco no puede pedir fotos de otro sitio cambiando un parametro
 * (CLAUDE.md seccion 18).
 */
export async function GET(request: Request) {
  try {
    const user = await requireRole('PUNTO_PAGO');
    const parkingLotId = scopeToParkingLot(user);
    const src = new URL(request.url).searchParams.get('src') ?? '';
    return await respuestaDeFoto(parkingLotId, src);
  } catch {
    // Sin sesion valida no se dice si la foto existe o no.
    return new Response(null, { status: 404 });
  }
}
