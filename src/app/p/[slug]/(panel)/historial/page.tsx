import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getTickets, type TicketFilters } from '@/integrations/nova-parking/panel';
import {
  parseUpstreamDate,
  paymentMethodLabel,
  stayMinutes,
  ticketPaid,
} from '@/lib/parking/tickets-view';
import { permanencia } from '@/lib/printing/receipt-data';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState, formatCOP } from '@/components/ui';
import { Pager } from '@/components/pager';
import {
  Row,
  SourceNotice,
  TableBody,
  TableHead,
  Th,
  TicketStatus,
  formatUpstreamDate,
} from '@/components/panel/pieces';
import { AutoRefresh } from '@/components/panel/auto-refresh';
import { LiveDuration } from '@/components/panel/live-duration';
import { VehiclePhoto } from '@/components/panel/vehicle-photo';
import { HistoryFilters } from './filters';

export const metadata = { title: 'Historial' };

/** Nova Parking pagina de a 10 y hoy no acepta otro tamano. */
const PAGE_SIZE = 10;

interface SearchParams extends Record<string, string | undefined> {
  q?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

/**
 * Historial de tiquetes del parqueadero: codigo, placa, entrada y salida, cuanto
 * tiempo estuvo (o lleva, si sigue adentro), si pago, con que y cuanto. Los filtros los
 * aplica Nova Parking. Para descargar un periodo completo esta Reportes (Excel).
 */
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { client } = await panelAccess(slug);

  const page = Math.max(1, Number(query.pagina) || 1);
  const filters: TicketFilters = {
    page,
    plate: query.q,
    status: query.estado,
    fromDate: query.desde,
    toDate: query.hasta,
  };

  const result = client ? await getTickets(client, filters) : NO_SOURCE;
  const hasFilters = Boolean(query.q || query.estado || query.desde || query.hasta);

  return (
    <>
      <PageHeader
        title="Historial"
        description="Cada vehiculo que entro, cuanto tiempo estuvo y como pago."
        action={<AutoRefresh />}
      />

      <HistoryFilters
        basePath={`/p/${slug}/historial`}
        current={{ q: query.q, estado: query.estado, desde: query.desde, hasta: query.hasta }}
      />

      <div className="mt-4">
        {!result.ok ? (
          <SourceNotice result={result} what="Historial de tiquetes" />
        ) : (
          <Card className="overflow-hidden">
            {result.data.rows.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'Ningun tiquete coincide' : 'Todavia no hay tiquetes'}
                description={
                  hasFilters
                    ? 'Prueba con un rango de fechas mas amplio o limpia los filtros.'
                    : 'Cuando entre el primer vehiculo, su tiquete aparece aqui.'
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[72rem] text-sm">
                    <TableHead>
                      <Th first>Foto</Th>
                      <Th>Codigo</Th>
                      <Th>Placa</Th>
                      <Th>Tipo</Th>
                      <Th>Entrada</Th>
                      <Th>Salida</Th>
                      <Th>Permanencia</Th>
                      <Th>Pago</Th>
                      <Th>Medio</Th>
                      <Th align="right">Valor</Th>
                      <Th last>Estado</Th>
                    </TableHead>
                    <TableBody>
                      {result.data.rows.map((ticket) => {
                        const entrada = parseUpstreamDate(ticket.checkedInAt);
                        const salida = parseUpstreamDate(ticket.checkedOutAt);
                        const adentro = ticket.status === 'IN' && !ticket.cancelled;
                        const minutos = stayMinutes(entrada, salida);
                        const pago = ticketPaid(ticket);
                        return (
                          <Row key={ticket.id}>
                            {/* Foto de la entrada: en el historial es la prueba
                                de que ese tiquete es ese vehiculo, util cuando
                                alguien reclama por un cobro. */}
                            <td className="py-2 pl-5 pr-4">
                              <VehiclePhoto
                                src={ticket.photo}
                                slug={slug}
                                label={ticket.plate ?? ticket.code ?? 'vehiculo'}
                              />
                            </td>
                            {/* El CODIGO, nunca el id: el id es secuencial y dejaria deducir otros. */}
                            <td className="tnum whitespace-nowrap py-3 pr-4 font-medium text-ink-100">
                              {ticket.code ?? <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="px-4 py-3 font-medium text-ink-100">
                              {ticket.plate ?? (
                                <span className="font-normal text-[var(--text-muted)]">Sin placa</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {ticket.vehicleType ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                              {formatUpstreamDate(ticket.checkedInAt)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                              {adentro ? '—' : formatUpstreamDate(ticket.checkedOutAt)}
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
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                                  pago
                                    ? 'bg-ok-500/12 text-ok-300 ring-ok-400/25'
                                    : 'bg-white/[0.05] text-[var(--text-secondary)] ring-[var(--line-subtle)]'
                                }`}
                              >
                                {pago ? 'Si' : 'No'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {/* Nova Parking deja "CASH" por defecto aun sin cobrar. */}
                              {pago ? (paymentMethodLabel(ticket.paymentMethod) ?? '—') : '—'}
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

                <Pager
                  basePath={`/p/${slug}/historial`}
                  page={page}
                  totalPages={Math.max(1, Math.ceil(result.data.total / PAGE_SIZE))}
                  query={query}
                />
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
