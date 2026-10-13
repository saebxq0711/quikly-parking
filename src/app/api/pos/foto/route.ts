import { AppError } from '@/lib/errors';
import { requireRole, scopeToParkingLot } from '@/lib/auth/guards';
import { fotoPermitida, respuestaDeFoto } from '@/lib/parking/vehicle-photo';

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
    // Una foto por cliente; el limite corta a quien la use para sondear el tunel.
    // En memoria, como el panel: cada foto ahorra una consulta a la base.
    if (!fotoPermitida(`foto-pos:${user.id}`, 30)) {
      throw new AppError('RATE_LIMITED');
    }
    const src = new URL(request.url).searchParams.get('src') ?? '';
    return await respuestaDeFoto(parkingLotId, src);
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') {
      return new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
    }
    // Sin sesion valida no se dice si la foto existe o no.
    return new Response(null, { status: 404 });
  }
}
