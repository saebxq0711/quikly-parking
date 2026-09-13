import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getTickets, type TicketFilters } from '@/integrations/nova-parking/panel';
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
import { DownloadButton } from '@/components/panel/download-button';
import { HistoryFilters } from './filters';

export const metadata = { title: 'Historial' };

/** Nova Parking pagina de a 10 y hoy no acepta otro tamano (ver seccion 4.1). */
const PAGE_SIZE = 10;

interface SearchParams extends Record<string, string | undefined> {
  q?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

/**
 * Historial de tiquetes del parqueadero.
 *
 * Aqui esta lo que el administrador mas pregunta: quien entro, con que placa,
 * en que estado quedo, quien le cobro. Eso ultimo no viene en campos propios —
 * vive en los logs de cada tiquete, que es de donde `panel.ts` lo deriva.
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
        description="Cada vehiculo que entro, como se cobro y quien lo atendio."
        action={
          result.ok && result.data.rows.length > 0 ? (
            <DownloadButton
              filename={`historial-${slug}`}
              label="Descargar pagina"
              columns={[
                { key: 'code', label: 'Codigo' },
                { key: 'plate', label: 'Placa' },
                { key: 'vehicleType', label: 'Tipo' },
                { key: 'status', label: 'Estado' },
                { key: 'checkedInAt', label: 'Ingreso' },
                { key: 'checkedOutAt', label: 'Salida' },
                { key: 'amount', label: 'Valor' },
                { key: 'paymentMethod', label: 'Medio de pago' },
                { key: 'enteredBy', label: 'Registro la entrada' },
                { key: 'chargedBy', label: 'Cobro' },
              ]}
              rows={result.data.rows as unknown as Record<string, unknown>[]}
            />
          ) : null
        }
      />

      <HistoryFilters
        basePath={`/p/${slug}/historial`}
        current={{
          q: query.q,
          estado: query.estado,
          desde: query.desde,
          hasta: query.hasta,
        }}
      />

      <div className="mt-4">
        {!result.ok ? (
          <SourceNotice result={result} what="Historial de tiquetes" />
        ) : (
          <Card>
            {result.data.rows.length === 0 ? (
              <EmptyState
                title={
                  hasFilters
                    ? 'Ningun tiquete coincide'
                    : 'Todavia no hay tiquetes'
                }
                description={
                  hasFilters
                    ? 'Prueba con un rango de fechas mas amplio o limpia los filtros.'
                    : 'Cuando entre el primer vehiculo, su tiquete aparece aqui.'
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[62rem] text-sm">
                    <TableHead>
                      <Th first>Codigo</Th>
                      <Th>Placa</Th>
                      <Th>Tipo</Th>
                      <Th>Ingreso</Th>
                      <Th>Salida</Th>
                      <Th align="right">Valor</Th>
                      <Th>Entrada por</Th>
                      <Th>Cobro</Th>
                      <Th last>Estado</Th>
                    </TableHead>
                    <TableBody>
                      {result.data.rows.map((ticket) => (
                        <Row key={ticket.id}>
                          {/*
                            El CODIGO, no el id. El id es el autoincremental de
                            Nova Parking y es secuencial: mostrarlo permitiria
                            deducir el de otro vehiculo. El codigo es ademas lo
                            unico que el cliente puede citar si reclama.
                          */}
                          <td className="tnum whitespace-nowrap py-3 pl-5 pr-4 font-medium text-ink-100">
                            {ticket.code ?? (
                              <span className="font-normal text-[var(--text-muted)]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-ink-100">
                            {ticket.plate ?? (
                              <span className="font-normal text-[var(--text-muted)]">
                                Sin placa
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {ticket.vehicleType ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                            {formatUpstreamDate(ticket.checkedInAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                            {formatUpstreamDate(ticket.checkedOutAt)}
                          </td>
                          <td className="tnum whitespace-nowrap px-4 py-3 text-right font-medium text-ink-100">
                            {ticket.amount !== null ? formatCOP(ticket.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {ticket.enteredBy ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {ticket.chargedBy ?? '—'}
                          </td>
                          <td className="py-3 pl-4 pr-5">
                            <TicketStatus
                              status={ticket.status}
                              cancelled={ticket.cancelled}
                            />
                          </td>
                        </Row>
                      ))}
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
