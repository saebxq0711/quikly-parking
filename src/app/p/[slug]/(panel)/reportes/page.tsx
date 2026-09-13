import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getReport, getTicketsExport, type ReportKind } from '@/integrations/nova-parking/panel';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState, formatCOP } from '@/components/ui';
import {
  CardTitle,
  Row,
  SourceNotice,
  Stat,
  TableBody,
  TableHead,
  Th,
  formatUpstreamDate,
} from '@/components/panel/pieces';
import { DownloadButton } from '@/components/panel/download-button';
import { ReportFilters } from './filters';

export const metadata = { title: 'Reportes' };

interface SearchParams extends Record<string, string | undefined> {
  tipo?: string;
  desde?: string;
  hasta?: string;
}

const KINDS: ReportKind[] = ['daily', 'monthly', 'consolidated', 'detailed-transactions'];

function isKind(value: string | undefined): value is ReportKind {
  return KINDS.includes(value as ReportKind);
}

/** Hoy por defecto, en la zona horaria del parqueadero y no la del servidor. */
function hoyEnBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Saca un numero de una respuesta cuya forma exacta decide Nova Parking. */
function pick(source: unknown, key: string): number | null {
  if (!isDict(source)) return null;
  const value = source[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function text(source: unknown, key: string): string | null {
  if (!isDict(source)) return null;
  const value = source[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/** Medios de pago como los registra Nova Parking en sus cajas. */
const METODO: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  CREDIT_CARD: 'Tarjeta',
  DEBIT_CARD: 'Tarjeta debito',
  TRANSFER: 'Transferencia',
  QR: 'Pago con QR',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  OTHER: 'Otro',
};

/** Conceptos de los movimientos de caja. */
const CONCEPTO: Record<string, string> = {
  TICKET: 'Tiquetes',
  MONTHLY: 'Mensualidades',
  MISCELLANEOUS: 'Otros servicios',
  COPY: 'Copias de tiquete',
  WITHDRAW: 'Retiros',
  DEPOSIT: 'Ingresos de efectivo',
  OPEN: 'Apertura de caja',
  CLOSE: 'Cierre de caja',
};

function etiqueta(mapa: Record<string, string>, clave: string | null): string {
  if (!clave) return '—';
  const conocida = mapa[clave.toUpperCase()];
  if (conocida) return conocida;
  const legible = clave.replace(/_/g, ' ').toLowerCase();
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}

/** `2026-09-01` -> `01/09/2026`, sin pasar por Date (que lo correria de dia por la zona horaria). */
function fechaCorta(value: string | null): string {
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

interface Desglose {
  clave: string;
  valor: number | null;
  operaciones: number | null;
  porcentaje: number | null;
}

function desglose(source: unknown): Desglose[] {
  if (!isDict(source)) return [];
  return Object.entries(source)
    .flatMap(([clave, datos]) =>
      isDict(datos)
        ? [
            {
              clave,
              valor: pick(datos, 'amount'),
              operaciones: pick(datos, 'count'),
              porcentaje: pick(datos, 'percentage'),
            },
          ]
        : [],
    )
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
}

interface Movimiento extends Record<string, unknown> {
  fecha: string;
  hora: string;
  concepto: string;
  medio: string;
  caja: string;
  cajero: string;
  referencia: string;
  valor: number | null;
}

function movimientos(data: unknown): Movimiento[] {
  const lista = Array.isArray(data)
    ? data
    : isDict(data) && Array.isArray(data.transactions)
      ? data.transactions
      : isDict(data) && Array.isArray(data.results)
        ? data.results
        : [];

  return lista.filter(isDict).map((t) => ({
    fecha: fechaCorta(text(t, 'date')),
    hora: (text(t, 'time') ?? '').slice(0, 5),
    concepto: etiqueta(CONCEPTO, text(t, 'transaction_type')),
    medio: etiqueta(METODO, text(t, 'payment_method')),
    caja: text(t, 'pos_name') ?? '—',
    cajero: text(t, 'cashier_name') ?? '—',
    referencia: text(t, 'reference') ?? '',
    valor: pick(t, 'amount'),
  }));
}

/**
 * Reportes del parqueadero, para ver y para descargar.
 *
 * Los calcula Nova Parking, no nosotros: recalcular el recaudo por nuestra cuenta
 * abriria la puerta a que su reporte y el nuestro no cuadren. Aqui se presentan en
 * cifras y tablas; nada se muestra tal como llega del sistema.
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
  const { client } = await panelAccess(slug);

  const kind: ReportKind = isKind(query.tipo) ? query.tipo : 'daily';
  const desde = query.desde || hoyEnBogota();
  const hasta = query.hasta || hoyEnBogota();

  // Cada reporte de Nova Parking pide sus propios parametros: el diario va por
  // `date`, el mensual por `month` (YYYY-MM), y los otros dos por rango.
  const filters =
    kind === 'daily'
      ? { date: desde }
      : kind === 'monthly'
        ? { month: desde.slice(0, 7) }
        : { from_date: desde, to_date: hasta };

  const [report, tickets] = client
    ? await Promise.all([
        getReport(client, kind, filters),
        getTicketsExport(client, { fromDate: desde, toDate: hasta }),
      ])
    : ([NO_SOURCE, NO_SOURCE] as const);

  const data = report.ok ? report.data : null;
  const summary = isDict(data) && isDict(data.summary) ? data.summary : null;
  const medios = isDict(data) ? desglose(data.payment_methods) : [];
  const conceptos = isDict(data) ? desglose(data.transaction_types) : [];
  const dias = isDict(data) && Array.isArray(data.daily_breakdown)
    ? data.daily_breakdown.filter(isDict)
    : [];
  const detalle = movimientos(data);

  const caja = text(data, 'pos_name');
  const cajero = text(data, 'cashier_name');
  const alcance = [
    caja && !/^(all|todas?|todos?)$/i.test(caja) ? `Caja: ${caja}` : null,
    cajero && !/^(all|todas?|todos?)$/i.test(cajero) ? `Cajero: ${cajero}` : null,
  ].filter(Boolean);

  const sinDatos =
    !summary && medios.length === 0 && conceptos.length === 0 && dias.length === 0 && detalle.length === 0;

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Recaudo y movimientos de caja del parqueadero."
      />

      <ReportFilters basePath={`/p/${slug}/reportes`} current={{ tipo: kind, desde, hasta }} />

      <div className="mt-4 space-y-4">
        {!report.ok ? (
          <SourceNotice result={report} what="Reportes" />
        ) : sinDatos ? (
          <Card>
            <EmptyState
              title="Sin movimientos en este periodo"
              description="No hay recaudo registrado para las fechas elegidas."
            />
          </Card>
        ) : (
          <>
            {summary ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Total recaudado"
                  value={pick(summary, 'total_sales') !== null ? formatCOP(pick(summary, 'total_sales')!) : '—'}
                  tone="accent"
                  hint={alcance.length > 0 ? alcance.join(' · ') : undefined}
                />
                <Stat
                  label="Operaciones"
                  value={pick(summary, 'total_transactions')?.toLocaleString('es-CO') ?? '—'}
                />
                <Stat
                  label="Efectivo al abrir"
                  value={pick(summary, 'cash_at_start') !== null ? formatCOP(pick(summary, 'cash_at_start')!) : '—'}
                />
                <Stat
                  label="Efectivo al cerrar"
                  value={pick(summary, 'cash_at_end') !== null ? formatCOP(pick(summary, 'cash_at_end')!) : '—'}
                />
              </div>
            ) : null}

            {medios.length > 0 || conceptos.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {medios.length > 0 ? (
                  <Card>
                    <CardTitle title="Por medio de pago" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <TableHead>
                          <Th first>Medio</Th>
                          <Th align="right">Operaciones</Th>
                          <Th align="right">Participacion</Th>
                          <Th align="right" last>
                            Valor
                          </Th>
                        </TableHead>
                        <TableBody>
                          {medios.map((m) => (
                            <Row key={m.clave}>
                              <td className="py-3 pl-5 pr-4 font-medium text-ink-100">
                                {etiqueta(METODO, m.clave)}
                              </td>
                              <td className="tnum px-4 py-3 text-right text-[var(--text-secondary)]">
                                {m.operaciones?.toLocaleString('es-CO') ?? '—'}
                              </td>
                              <td className="tnum px-4 py-3 text-right text-[var(--text-secondary)]">
                                {m.porcentaje !== null ? `${m.porcentaje.toLocaleString('es-CO')} %` : '—'}
                              </td>
                              <td className="tnum py-3 pl-4 pr-5 text-right font-medium text-ink-100">
                                {m.valor !== null ? formatCOP(m.valor) : '—'}
                              </td>
                            </Row>
                          ))}
                        </TableBody>
                      </table>
                    </div>
                  </Card>
                ) : null}

                {conceptos.length > 0 ? (
                  <Card>
                    <CardTitle title="Por concepto" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <TableHead>
                          <Th first>Concepto</Th>
                          <Th align="right">Operaciones</Th>
                          <Th align="right" last>
                            Valor
                          </Th>
                        </TableHead>
                        <TableBody>
                          {conceptos.map((c) => (
                            <Row key={c.clave}>
                              <td className="py-3 pl-5 pr-4 font-medium text-ink-100">
                                {etiqueta(CONCEPTO, c.clave)}
                              </td>
                              <td className="tnum px-4 py-3 text-right text-[var(--text-secondary)]">
                                {c.operaciones?.toLocaleString('es-CO') ?? '—'}
                              </td>
                              <td className="tnum py-3 pl-4 pr-5 text-right font-medium text-ink-100">
                                {c.valor !== null ? formatCOP(c.valor) : '—'}
                              </td>
                            </Row>
                          ))}
                        </TableBody>
                      </table>
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {dias.length > 0 ? (
              <Card>
                <CardTitle title="Dia a dia" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-sm">
                    <TableHead>
                      <Th first>Fecha</Th>
                      <Th align="right">Operaciones</Th>
                      <Th align="right" last>
                        Recaudo
                      </Th>
                    </TableHead>
                    <TableBody>
                      {dias.map((dia, index) => (
                        <Row key={text(dia, 'date') ?? index}>
                          <td className="tnum py-3 pl-5 pr-4 text-ink-100">
                            {fechaCorta(text(dia, 'date'))}
                          </td>
                          <td className="tnum px-4 py-3 text-right text-[var(--text-secondary)]">
                            {pick(dia, 'transaction_count')?.toLocaleString('es-CO') ?? '—'}
                          </td>
                          <td className="tnum py-3 pl-4 pr-5 text-right font-medium text-ink-100">
                            {pick(dia, 'total_amount') !== null ? formatCOP(pick(dia, 'total_amount')!) : '—'}
                          </td>
                        </Row>
                      ))}
                    </TableBody>
                  </table>
                </div>
              </Card>
            ) : null}

            {detalle.length > 0 ? (
              <Card>
                <CardTitle
                  title="Movimientos"
                  description={`${detalle.length} operaciones en el periodo`}
                  action={
                    <DownloadButton
                      filename={`movimientos-${slug}`}
                      label="Descargar en CSV"
                      columns={[
                        { key: 'fecha', label: 'Fecha' },
                        { key: 'hora', label: 'Hora' },
                        { key: 'concepto', label: 'Concepto' },
                        { key: 'medio', label: 'Medio de pago' },
                        { key: 'caja', label: 'Caja' },
                        { key: 'cajero', label: 'Cajero' },
                        { key: 'referencia', label: 'Referencia' },
                        { key: 'valor', label: 'Valor' },
                      ]}
                      rows={detalle}
                    />
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-sm">
                    <TableHead>
                      <Th first>Fecha</Th>
                      <Th>Concepto</Th>
                      <Th>Medio</Th>
                      <Th>Caja</Th>
                      <Th>Cajero</Th>
                      <Th align="right" last>
                        Valor
                      </Th>
                    </TableHead>
                    <TableBody>
                      {detalle.slice(0, 50).map((m, index) => (
                        <Row key={index}>
                          <td className="tnum whitespace-nowrap py-3 pl-5 pr-4 text-[var(--text-secondary)]">
                            {m.fecha} {m.hora}
                          </td>
                          <td className="px-4 py-3 text-ink-100">{m.concepto}</td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">{m.medio}</td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">{m.caja}</td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">{m.cajero}</td>
                          <td className="tnum whitespace-nowrap py-3 pl-4 pr-5 text-right font-medium text-ink-100">
                            {m.valor !== null ? formatCOP(m.valor) : '—'}
                          </td>
                        </Row>
                      ))}
                    </TableBody>
                  </table>
                  {detalle.length > 50 ? (
                    <p className="border-t border-[var(--line-subtle)] px-5 py-3 text-xs text-[var(--text-muted)]">
                      Se muestran 50 de {detalle.length}. El CSV los trae todos.
                    </p>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </>
        )}

        {/* ------------------------------- Tiquetes del periodo, descargables */}
        {!tickets.ok ? (
          <SourceNotice result={tickets} what="Tiquetes del periodo" />
        ) : (
          <Card>
            <CardTitle
              title="Tiquetes del periodo"
              description={`${tickets.data.length} tiquetes entre ${fechaCorta(desde)} y ${fechaCorta(hasta)}`}
              action={
                <DownloadButton
                  filename={`tiquetes-${slug}`}
                  label="Descargar todo en CSV"
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
                    { key: 'paidAt', label: 'Fecha del cobro' },
                  ]}
                  rows={tickets.data as unknown as Record<string, unknown>[]}
                />
              }
            />

            {tickets.data.length === 0 ? (
              <EmptyState
                title="Sin tiquetes en este periodo"
                description="Prueba con otro rango de fechas."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <TableHead>
                    <Th first>Codigo</Th>
                    <Th>Placa</Th>
                    <Th>Ingreso</Th>
                    <Th>Cobro</Th>
                    <Th align="right">Valor</Th>
                    <Th last>Medio</Th>
                  </TableHead>
                  <TableBody>
                    {tickets.data.slice(0, 15).map((ticket) => (
                      <Row key={ticket.id}>
                        <td className="tnum py-3 pl-5 pr-4 text-[var(--text-secondary)]">
                          {ticket.code ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink-100">
                          {ticket.plate ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                          {formatUpstreamDate(ticket.checkedInAt)}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {ticket.chargedBy ?? '—'}
                        </td>
                        <td className="tnum whitespace-nowrap px-4 py-3 text-right font-medium text-ink-100">
                          {ticket.amount !== null ? formatCOP(ticket.amount) : '—'}
                        </td>
                        <td className="py-3 pl-4 pr-5 text-[var(--text-secondary)]">
                          {etiqueta(METODO, ticket.paymentMethod)}
                        </td>
                      </Row>
                    ))}
                  </TableBody>
                </table>
                {tickets.data.length > 15 ? (
                  <p className="border-t border-[var(--line-subtle)] px-5 py-3 text-xs text-[var(--text-muted)]">
                    Se muestran 15 de {tickets.data.length}. El CSV los trae todos.
                  </p>
                ) : null}
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
