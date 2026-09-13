import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { novaClientFor } from './config';
import type { NovaParkingClient } from '@/integrations/nova-parking/client';

/**
 * Resuelve el parqueadero de la URL y su cliente hacia Nova Parking.
 *
 * El aislamiento ya lo aplica el layout del area, pero se repite aqui a
 * proposito: cada pagina que lee datos del sistema del parqueadero vuelve a
 * comprobar que ese sitio es el del usuario. Un guard que vive en un solo sitio
 * se rompe el dia que alguien agrega una ruta y olvida el layout (CLAUDE.md
 * seccion 18).
 *
 * Devuelve `client: null` cuando el sitio todavia no tiene configurada la URL de
 * su sistema, para que la pagina lo diga en vez de reventar.
 */
export async function panelAccess(slug: string): Promise<{
  lot: { id: string; name: string; slug: string; novaBaseUrl: string | null };
  client: NovaParkingClient | null;
}> {
  const user = await requireUser();

  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, novaBaseUrl: true, active: true, testMode: true },
  });
  if (!lot) notFound();

  const allowed = user.role === 'SUPERADMIN' || user.parkingLotId === lot.id;
  if (!allowed) notFound();

  // En modo de pruebas no hace falta URL: el sistema esta simulado.
  if (!lot.novaBaseUrl && !lot.testMode) return { lot, client: null };

  try {
    return { lot, client: await novaClientFor(lot.id) };
  } catch {
    // Sitio inactivo o credencial ausente: la pagina lo muestra como origen
    // no disponible, que es exactamente lo que es.
    return { lot, client: null };
  }
}

/** Lo que se muestra cuando el sitio no tiene a donde consultar. */
export const NO_SOURCE = {
  ok: false as const,
  reason: 'unreachable' as const,
  detail:
    'Este parqueadero todavia no tiene configurada la conexion con su sistema. ' +
    'Un super administrador debe registrarla en la ficha del sitio.',
};
