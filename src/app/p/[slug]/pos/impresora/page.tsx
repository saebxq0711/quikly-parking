import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser, scopeToParkingLot } from '@/lib/auth/guards';
import { PrinterSetup } from './printer-setup';

export const metadata = { title: 'Impresora del kiosco' };

/**
 * Configuracion de la impresora del kiosco de pago.
 *
 * Se usa una sola vez al instalar el kiosco: se conecta la impresora por USB, se
 * autoriza aqui y se imprime una prueba. Desde ahi el navegador la recuerda y el kiosco
 * imprime solo. Se llega desde el menu oculto del kiosco (mantener presionado el
 * nombre del parqueadero).
 */
export default async function PrinterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/p/${slug}/pos/impresora`);
  if (user.role !== 'PUNTO_PAGO') notFound();

  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!lot) notFound();
  scopeToParkingLot(user, lot.id);

  return <PrinterSetup parkingLotName={lot.name} backHref={`/p/${slug}/pos`} />;
}
