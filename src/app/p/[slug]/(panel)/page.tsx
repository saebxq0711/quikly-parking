import Link from 'next/link';
import { MdArrowForward } from 'react-icons/md';
import { db } from '@/lib/db';
import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getDashboard, getVehiclesInside, getCashBoxes } from '@/integrations/nova-parking/panel';
import { PageHeader } from '@/components/app-shell';
import { Card, formatCOP } from '@/components/ui';
import { SourceNotice, Stat } from '@/components/panel/pieces';

export const metadata = { title: 'Resumen' };

/**
 * Pantalla de entrada del administrador de parqueadero.
 *
 * Las cuatro cifras de arriba son las mismas del cuadro de mando de Nova Parking
 * (vehiculos presentes, ingresados hoy, ingresados este mes, ganancias del mes), para
 * que el administrador vea lo mismo en los dos sistemas. Debajo: que hay adentro por
 * tipo, las cajas, y lo cobrado hoy en el kiosco de pago.
 */
export default async function PanelHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { lot, client } = await panelAccess(slug);

  const [dashboard, inside, boxes] = client
    ? await Promise.all([
        getDashboard(client),
        getVehiclesInside(client),
        getCashBoxes(client),
      ])
    : ([NO_SOURCE, NO_SOURCE, NO_SOURCE] as const);

  const desdeMedianoche = new Date();
  desdeMedianoche.setHours(0, 0, 0, 0);

  const [kioskCount, kioskTotal] = await Promise.all([
    db.payment.count({
      where: { parkingLotId: lot.id, status: 'APPROVED', createdAt: { gte: desdeMedianoche } },
    }),
    db.payment.aggregate({
      where: { parkingLotId: lot.id, status: 'APPROVED', createdAt: { gte: desdeMedianoche } },
      _sum: { amount: true },
    }),
  ]);

  const openBoxes = boxes.ok ? boxes.data.filter((b) => b.status === 'OPEN') : [];
  const numero = (value: number | null | undefined) =>
    typeof value === 'number' ? value.toLocaleString('es-CO') : '—';

  return (
    <>
      <PageHeader title={lot.name} description="Resumen del parqueadero en tiempo real." />

      {dashboard.ok ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Vehiculos presentes" value={numero(dashboard.data.inside)} tone="accent" />
          <Stat label="Ingresados hoy" value={numero(dashboard.data.today)} />
          <Stat label="Ingresados este mes" value={numero(dashboard.data.month)} />
          <Stat
            label="Ganancias del mes"
            value={
              dashboard.data.monthRevenue !== null ? formatCOP(dashboard.data.monthRevenue) : '—'
            }
          />
        </div>
      ) : (
        <SourceNotice result={dashboard} what="Cifras del parqueadero" />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-sm font-semibold text-ink-100">Adentro ahora</h2>
            <Link
              href={`/p/${slug}/adentro`}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
            >
              Ver vehiculos
              <MdArrowForward className="h-4 w-4" aria-hidden focusable="false" />
            </Link>
          </div>

          {inside.ok ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3">
              {(
                [
                  ['Carros', inside.data.cars],
                  ['Motos', inside.data.motorcycles],
                  ['Bicicletas', inside.data.bicycles],
                  ['Patinetas', inside.data.scooters],
                  ['Mensualidad', inside.data.monthly],
                  ...(inside.data.undefinedType
                    ? ([['Por definir', inside.data.undefinedType]] as const)
                    : []),
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    {label}
                  </dt>
                  <dd className="tnum mt-1 text-2xl font-semibold text-ink-50">{numero(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="p-5">
              <SourceNotice result={inside} what="Vehiculos adentro" />
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-sm font-semibold text-ink-100">Cajas</h2>
            <Link
              href={`/p/${slug}/cajas`}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
            >
              Ver movimientos
              <MdArrowForward className="h-4 w-4" aria-hidden focusable="false" />
            </Link>
          </div>

          {boxes.ok ? (
            <div className="p-5">
              <p className="tnum text-2xl font-semibold text-ink-50">
                {openBoxes.length} de {boxes.data.length} abiertas
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {openBoxes.length === 0
                  ? 'Ninguna caja abierta en este momento.'
                  : openBoxes
                      .map((b) => (b.responsibleName ? `${b.name} (${b.responsibleName})` : b.name))
                      .join(', ')}
              </p>
            </div>
          ) : (
            <div className="p-5">
              <SourceNotice result={boxes} what="Cajas" />
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-sm font-semibold text-ink-100">Kiosco de pago hoy</h2>
            <Link
              href={`/p/${slug}/pagos`}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
            >
              Ver los pagos
              <MdArrowForward className="h-4 w-4" aria-hidden focusable="false" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-3 p-5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                Pagos aprobados
              </p>
              <p className="tnum mt-1 text-2xl font-semibold text-ink-50">{kioskCount}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                Recaudado
              </p>
              <p className="tnum mt-1 text-2xl font-semibold text-ink-50">
                {formatCOP(kioskTotal._sum.amount ?? 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
