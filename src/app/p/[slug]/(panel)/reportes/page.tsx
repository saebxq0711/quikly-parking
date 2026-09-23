import { db } from '@/lib/db';
import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getTicketsExport } from '@/integrations/nova-parking/panel';
import {
  parseUpstreamDate,
  paymentMethodLabel,
  stayMinutes,
  ticketPaid,
} from '@/lib/parking/tickets-view';
import { permanencia } from '@/lib/printing/receipt-data';
import { PageHeader } from '@/components/app-shell';
import { Alert, Card, EmptyState, formatCOP } from '@/components/ui';
import {
  CardTitle,
  Row,
  SourceNotice,
  Stat,
  TableBody,
  TableHead,
  Th,
  TicketStatus,
  formatUpstreamDate,
} from '@/components/panel/pieces';
import { Pager } from '@/components/pager';
import { ReportFilters } from './filters';
import { ExcelButton } from './excel-button';

export const metadata = { title: 'Reportes' };

const MAX_DIAS = 31;
/**
 * Filas por pagina en la vista previa. El Excel lleva todas, sin paginar: es el
 * archivo el que se guarda y se manda al contador, esto es solo para mirar por
 * encima que el periodo elegido trae lo que se espera.
 */
const VISTA_PREVIA = 50;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

interface SearchParams extends Record<string, string | undefined> {
  desde?: string;
  hasta?: string;
  pagina?: string;
}

function diaEnBogota(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

/**
 * Reportes del parqueadero.
 *
 * Un periodo (maximo 31 dias), sus cifras y el Excel con todo el detalle: vehiculos del
 * sistema del parqueadero y pagos del kiosco. Los vehiculos vienen de Nova Parking; de
 * nuestra base solo salen los pagos del kiosco.
 */
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { lot, client } = await panelAccess(slug);

  const hoy = diaEnBogota(new Date());
  const hasta = DIA.test(query.hasta ?? '') ? query.hasta! : hoy;
  const desde = DIA.test(query.desde ?? '')
    ? query.desde!
    : diaEnBogota(new Date(Date.parse(`${hasta}T12:00:00-05:00`) - 6 * 86_400_000));

  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
  const rangoValido = dias >= 1 && dias <= MAX_DIAS;

  const inicio = new Date(`${desde}T00:00:00-05:00`);
  const fin = new Date(`${hasta}T23:59:59.999-05:00`);

  const [tickets, kiosco] = await Promise.all([
    !rangoValido
      ? null
      : client
        ? getTicketsExport(client, { fromDate: desde, toDate: hasta })
        : NO_SOURCE,
    rangoValido
      ? db.payment.aggregate({
          where: { parkingLotId: lot.id, status: 'APPROVED', createdAt: { gte: inicio, lte: fin } },
          _sum: { amount: true },
          _count: true,
        })
      : null,
  ]);

  const filas = tickets?.ok ? tickets.data : [];
  const adentro = filas.filter((t) => t.status === 'IN' && !t.cancelled).length;
  const pagados = filas.filter(ticketPaid);
  const sinPagar = filas.filter((t) => !t.cancelled && !ticketPaid(t)).length;
  const recaudado = pagados.reduce((suma, t) => suma + (t.amount ?? 0), 0);

  const pagina = Math.max(1, Number(query.pagina) || 1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / VISTA_PREVIA));
  const enPantalla = filas.slice((pagina - 1) * VISTA_PREVIA, pagina * VISTA_PREVIA);

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Quien entro, quien sigue adentro, quien pago, cuanto y cuanto tiempo estuvo."
        action={
          rangoValido ? (
            <ExcelButton
              href={`/api/panel/${slug}/reporte?desde=${desde}&hasta=${hasta}`}
              filename={`reporte-${slug}-${desde}_${hasta}.xlsx`}
            />
          ) : null
        }
      />

      <Card className="mb-6 p-4">
        <ReportFilters
          basePath={`/p/${slug}/reportes`}
          current={{ desde, hasta }}
          hoy={hoy}
          maxDias={MAX_DIAS}
        />
      </Card>

      {!rangoValido ? (
        <Alert tone="warning" title="Revisa el periodo">
          La fecha inicial debe ser anterior a la final y el periodo no puede pasar de{' '}
          {MAX_DIAS} dias.
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="Entraron"
              value={tickets?.ok ? filas.length.toLocaleString('es-CO') : '—'}
              tone="accent"
            />
            <Stat label="Siguen adentro" value={tickets?.ok ? adentro.toLocaleString('es-CO') : '—'} />
            <Stat
              label="Pagaron"
              value={tickets?.ok ? pagados.length.toLocaleString('es-CO') : '—'}
              hint={tickets?.ok ? `${sinPagar} sin pagar` : undefined}
            />
            <Stat label="Recaudado" value={tickets?.ok ? formatCOP(recaudado) : '—'} />
            <Stat
              label="Kiosco de pago"
              value={formatCOP(kiosco?._sum.amount ?? 0)}
              hint={`${kiosco?._count ?? 0} pagos aprobados`}
            />
          </div>

          <div className="mt-6">
            {tickets && !tickets.ok ? (
              <SourceNotice result={tickets} what="Vehiculos del periodo" />
            ) : (
              <Card className="overflow-hidden">
                <CardTitle
                  title="Vehiculos del periodo"
                  description={
                    filas.length > VISTA_PREVIA
                      ? `${filas.length} vehiculos en el periodo. El Excel trae ademas quien registro la entrada, quien cobro y los pagos del kiosco.`
                      : 'El Excel trae ademas quien registro la entrada, quien cobro y los pagos del kiosco.'
                  }
                />
                {filas.length === 0 ? (
                  <EmptyState
                    title="Sin movimiento en el periodo"
                    description="No entro ningun vehiculo entre esas fechas."
                  />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[60rem] text-sm">
                        <TableHead>
                          <Th first>Codigo</Th>
                          <Th>Placa</Th>
                          <Th>Tipo</Th>
                          <Th>Entrada</Th>
                          <Th>Salida</Th>
                          <Th>Permanencia</Th>
                          <Th>Medio</Th>
                          <Th align="right">Valor</Th>
                          <Th last>Estado</Th>
                        </TableHead>
                        <TableBody>
                          {enPantalla.map((ticket) => {
                            const adentroAhora = ticket.status === 'IN' && !ticket.cancelled;
                            const minutos = stayMinutes(
                              parseUpstreamDate(ticket.checkedInAt),
                              adentroAhora ? null : parseUpstreamDate(ticket.checkedOutAt),
                            );
                            return (
                              <Row key={ticket.id}>
                                <td className="tnum whitespace-nowrap py-3 pl-5 pr-4 font-medium text-ink-100">
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
                                <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                                  {adentroAhora ? '—' : formatUpstreamDate(ticket.checkedOutAt)}
                                </td>
                                <td className="tnum whitespace-nowrap px-4 py-3 text-ink-100">
                                  {minutos !== null ? permanencia(minutos) : '—'}
                                </td>
                                <td className="px-4 py-3 text-[var(--text-secondary)]">
                                  {ticketPaid(ticket) ? (paymentMethodLabel(ticket.paymentMethod) ?? '—') : '—'}
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
                    {totalPaginas > 1 ? (
                      <Pager
                        basePath={`/p/${slug}/reportes`}
                        page={pagina}
                        totalPages={totalPaginas}
                        query={query}
                      />
                    ) : null}
                  </>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
