import Link from 'next/link';
import { MdArrowForward } from 'react-icons/md';
import { db } from '@/lib/db';
import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import {
  getCashBoxes,
  getDashboard,
  getTickets,
  getVehiclesInside,
} from '@/integrations/nova-parking/panel';
import {
  parseUpstreamDate,
  paymentMethodLabel,
  stayMinutes,
  ticketPaid,
} from '@/lib/parking/tickets-view';
import { permanencia } from '@/lib/printing/receipt-data';
import { PageHeader } from '@/components/app-shell';
import { Card, formatCOP } from '@/components/ui';
import {
  Row,
  SourceNotice,
  Stat,
  TableBody,
  TableHead,
  Th,
  TicketStatus,
  formatUpstreamDate,
} from '@/components/panel/pieces';
import { AutoRefresh } from '@/components/panel/auto-refresh';
import { LiveDuration } from '@/components/panel/live-duration';
import { VehiclePhoto } from '@/components/panel/vehicle-photo';

export const metadata = { title: 'Resumen' };

/**
 * Pantalla de entrada del administrador de parqueadero, en vivo.
 *
 * Arriba las cifras del cuadro de mando de Nova Parking; debajo, que hay adentro, las
 * cajas, lo cobrado hoy en el kiosco y los ultimos movimientos con su codigo, placa,
 * permanencia y pago. Se actualiza sola cada 30 segundos.
 */
export default async function PanelHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { lot, client } = await panelAccess(slug);

  const [dashboard, inside, boxes, recientes] = client
    ? await Promise.all([
        getDashboard(client),
        getVehiclesInside(client),
        getCashBoxes(client),
        getTickets(client, { page: 1 }),
      ])
    : ([NO_SOURCE, NO_SOURCE, NO_SOURCE, NO_SOURCE] as const);

  // Medianoche de Bogota, no la del servidor (Vercel corre en UTC).
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const desdeMedianoche = new Date(`${hoy}T00:00:00-05:00`);

  const kiosco = await db.payment.aggregate({
    where: { parkingLotId: lot.id, status: 'APPROVED', createdAt: { gte: desdeMedianoche } },
    _sum: { amount: true },
    _count: true,
  });

  const openBoxes = boxes.ok ? boxes.data.filter((b) => b.status === 'OPEN') : [];
  const numero = (value: number | null | undefined) =>
    typeof value === 'number' ? value.toLocaleString('es-CO') : '—';

  return (
    <>
      <PageHeader title={lot.name} description="El parqueadero en este momento." action={<AutoRefresh />} />

      {dashboard.ok ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Vehiculos adentro" value={numero(dashboard.data.inside)} tone="accent" />
          <Stat label="Entraron hoy" value={numero(dashboard.data.today)} />
          <Stat label="Entraron este mes" value={numero(dashboard.data.month)} />
          <Stat
            label="Ganancias del mes"
            value={dashboard.data.monthRevenue !== null ? formatCOP(dashboard.data.monthRevenue) : '—'}
          />
        </div>
      ) : (
        <SourceNotice result={dashboard} what="Cifras del parqueadero" />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle title="Adentro ahora" href={`/p/${slug}/adentro`} link="Ver vehiculos" />
          {inside.ok ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5">
              {(
                [
                  ['Carros', inside.data.cars],
                  ['Motos', inside.data.motorcycles],
                  ['Bicicletas', inside.data.bicycles],
                  ['Patinetas', inside.data.scooters],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
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
          <SectionTitle title="Cajas" href={`/p/${slug}/cajas`} link="Ver movimientos" />
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

        <Card>
          <SectionTitle title="Kiosco de pago hoy" href={`/p/${slug}/pagos`} link="Ver pagos" />
          <div className="grid grid-cols-2 gap-4 p-5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Pagos</p>
              <p className="tnum mt-1 text-2xl font-semibold text-ink-50">{kiosco._count}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Recaudado</p>
              <p className="tnum mt-1 text-2xl font-semibold text-ink-50">
                {formatCOP(kiosco._sum.amount ?? 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card className="overflow-hidden">
          <SectionTitle title="Ultimos movimientos" href={`/p/${slug}/historial`} link="Ver historial" />
          {recientes.ok ? (
            recientes.data.rows.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-[var(--text-secondary)]">Todavia no hay tiquetes.</p>
            ) : (
              <div className="mt-3 overflow-x-auto border-t border-[var(--line-subtle)]">
                <table className="w-full min-w-[62rem] text-sm">
                  <TableHead>
                    <Th first>Foto</Th>
                    <Th>Codigo</Th>
                    <Th>Placa</Th>
                    <Th>Tipo</Th>
                    <Th>Entrada</Th>
                    <Th>Permanencia</Th>
                    <Th>Pago</Th>
                    <Th align="right">Valor</Th>
                    <Th last>Estado</Th>
                  </TableHead>
                  <TableBody>
                    {recientes.data.rows.map((ticket) => {
                      const entrada = parseUpstreamDate(ticket.checkedInAt);
                      const adentro = ticket.status === 'IN' && !ticket.cancelled;
                      const minutos = stayMinutes(entrada, parseUpstreamDate(ticket.checkedOutAt));
                      const pago = ticketPaid(ticket);
                      return (
                        <Row key={ticket.id}>
                          {/* La foto primero: es lo que deja reconocer el
                              vehiculo sin leer una sola columna. */}
                          <td className="py-2 pl-5 pr-4">
                            <VehiclePhoto
                              src={ticket.photo}
                              slug={slug}
                              label={ticket.plate ?? ticket.code ?? 'vehiculo'}
                            />
                          </td>
                          <td className="tnum whitespace-nowrap py-3 pr-4 font-medium text-ink-100">
                            {ticket.code ?? '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-ink-100">
                            {ticket.plate ?? (
                              <span className="font-normal text-[var(--text-muted)]">Sin placa</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">{ticket.vehicleType ?? '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                            {formatUpstreamDate(ticket.checkedInAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-100">
                            {adentro ? (
                              <LiveDuration since={entrada?.toISOString() ?? null} />
                            ) : minutos !== null ? (
                              <span className="tnum">{permanencia(minutos)}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {pago ? (paymentMethodLabel(ticket.paymentMethod) ?? 'Si') : 'Pendiente'}
                          </td>
                          <td className="tnum whitespace-nowrap px-4 py-3 text-right font-medium text-ink-100">
                            {ticket.amount !== null ? formatCOP(ticket.amount) : '—'}
                          </td>
                          <td className="py-3 pl-4 pr-5">
                            <TicketStatus status={ticket.status} cancelled={ticket.cancelled} />
                          </td>
                        </Row>
                      );
                    })}
                  </TableBody>
                </table>
              </div>
            )
          ) : (
            <div className="p-5">
              <SourceNotice result={recientes} what="Ultimos movimientos" />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function SectionTitle({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5">
      <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      <Link
        href={href}
        className="group inline-flex items-center gap-1 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
      >
        {link}
        <MdArrowForward
          className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden
          focusable="false"
        />
      </Link>
    </div>
  );
}
