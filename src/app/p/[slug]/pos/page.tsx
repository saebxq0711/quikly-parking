import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser, scopeToParkingLot } from '@/lib/auth/guards';
import { getVehicleRules } from '@/lib/parking/config';
import { getPaymentPoint } from '@/lib/parking/payment-point';
import { findLivePayment } from '@/lib/payments/service';
import { serializePayment } from '@/lib/payments/serialize';
import { PosFlow } from '@/components/pos/pos-flow';
import { emisorDe } from '@/lib/printing/receipt-data';

export const metadata = { title: 'Punto de pago' };

/**
 * Punto de pago del parqueadero.
 *
 * Cada parqueadero tiene un unico punto de pago, asi que no hay nada que
 * elegir: se entra directo a cobrar.
 *
 * Si hay un cobro vivo se retoma. Es importante: el datafono es serial y el
 * cliente puede estar con la tarjeta en la mano; que una recarga del navegador
 * dejara la pantalla en blanco significaria perderle el rastro a un cobro que
 * quiza ya se aprobo.
 */
export default async function PosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/p/${slug}/pos`);

  // El punto de pago es solo para su rol: un administrador no cobra.
  if (user.role !== 'PUNTO_PAGO') notFound();

  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      active: true,
      testMode: true,
      legalName: true,
      nit: true,
      taxRegime: true,
      address: true,
      city: true,
      department: true,
      phone: true,
      email: true,
    },
  });
  if (!lot) notFound();

  let parkingLotId: string;
  try {
    parkingLotId = scopeToParkingLot(user, lot.id);
  } catch {
    notFound();
  }

  if (!lot.active) {
    return (
      <Notice
        title="Fuera de servicio"
        detail="Este punto de pago esta fuera de servicio. Acercate a la oficina del parqueadero para pagar."
      />
    );
  }

  let point;
  try {
    point = await getPaymentPoint(user, parkingLotId);
  } catch {
    return (
      <Notice
        title="Fuera de servicio"
        detail="Este punto de pago esta fuera de servicio. Acercate a la oficina del parqueadero para pagar."
      />
    );
  }

  const rules = (await getVehicleRules(parkingLotId)).filter((r) => r.enabled);

  if (rules.length === 0) {
    return (
      <Notice
        title="Fuera de servicio"
        detail="Este punto de pago esta fuera de servicio. Acercate a la oficina del parqueadero para pagar."
      />
    );
  }

  const live = await findLivePayment(parkingLotId, point.id);

  return (
    <PosFlow
      vehicles={rules.map((rule) => ({
        vehicleType: rule.vehicleType,
        label: rule.label,
        identifierKind: rule.identifierKind,
        inputLabel: rule.inputLabel,
        inputPlaceholder: rule.inputPlaceholder,
      }))}
      parkingLotName={lot.name}
      issuer={emisorDe(lot)}
      testMode={lot.testMode}
      paymentPointName={point.name}
      livePayment={live ? serializePayment(live) : null}
    />
  );
}

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-ink-100">{title}</h1>
        <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">
          {detail}
        </p>
      </div>
    </main>
  );
}
