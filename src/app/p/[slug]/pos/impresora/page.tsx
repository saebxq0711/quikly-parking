import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser, scopeToParkingLot } from '@/lib/auth/guards';
import { emisorDe } from '@/lib/printing/receipt-data';
import { PrinterSetup } from './printer-setup';

export const metadata = { title: 'Impresora del kiosco' };

/**
 * Configuracion de la impresora del kiosco de pago.
 *
 * Se usa una sola vez al instalar el kiosco: se conecta la impresora por USB, se
 * autoriza aqui y se imprime un comprobante de prueba con los datos reales del
 * parqueadero. Desde ahi el navegador la recuerda y el kiosco imprime solo. Se llega
 * desde el menu oculto del kiosco (mantener presionado el nombre del parqueadero).
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
    select: {
      id: true,
      name: true,
      legalName: true,
      nit: true,
      taxRegime: true,
      address: true,
      city: true,
      department: true,
      phone: true,
      email: true,
      insurer: true,
      insurancePolicy: true,
      businessHours: true,
    },
  });
  if (!lot) notFound();
  scopeToParkingLot(user, lot.id);

  return <PrinterSetup issuer={emisorDe(lot)} backHref={`/p/${slug}/pos`} />;
}
