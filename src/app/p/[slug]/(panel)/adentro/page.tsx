import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getTicketsExport, getVehiclesInside } from '@/integrations/nova-parking/panel';
import { parseUpstreamDate } from '@/lib/parking/tickets-view';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState } from '@/components/ui';
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
import { Pager } from '@/components/pager';
import { AutoRefresh } from '@/components/panel/auto-refresh';
import { LiveDuration } from '@/components/panel/live-duration';
import { VehiclePhoto } from '@/components/panel/vehicle-photo';

export const metadata = { title: 'Adentro ahora' };

/**
 * Cuantos vehiculos se ven por pagina.
 *
 * El reporte de presentes llega entero, sin paginar: en un parqueadero lleno son
 * cientos de filas de una sola vez, y una tabla que no termina no se consulta,
 * se cierra. Se recorta aqui, y las cifras de arriba siguen contando el total.
 */
const PAGE_SIZE = 50;

/**
 * Quien esta adentro en este momento, con el tiempo corriendo.
 *
 * Lo que Nova Parking considera "adentro" son los tiquetes en IN sin anular, y como
 * marca OUT al cobrar, todo vehiculo de esta lista esta pendiente de pago (salvo
 * mensualidades). El codigo del tiquete sale del volcado de tiquetes abiertos, porque
 * el reporte de presentes no lo trae.
 */
export default async function InsidePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { client } = await panelAccess(slug);

  const [inside, abiertos] = client
    ? await Promise.all([getVehiclesInside(client), getTicketsExport(client, { status: 'IN' })])
    : ([NO_SOURCE, NO_SOURCE] as const);

  const porId = new Map(abiertos.ok ? abiertos.data.map((ticket) => [ticket.id, ticket]) : []);

  const vehiculos = inside.ok
    ? inside.data.vehicles
        .map((vehiculo) => {
          const entrada = parseUpstreamDate(vehiculo.checkedInAt);
          return {
            ...vehiculo,
            code: porId.get(vehiculo.ticketId)?.code ?? null,
            // El reporte de presentes no trae la foto; el volcado de tiquetes
            // abiertos si, y ya se esta cruzando para sacar el codigo.
            photo: porId.get(vehiculo.ticketId)?.photo ?? null,
            entradaIso: entrada?.toISOString() ?? null,
            entradaMs: entrada?.getTime() ?? Number.MAX_SAFE_INTEGER,
            mensualidad: /mensual/i.test(vehiculo.clientKind ?? ''),
          };
        })
        /*
          El que acaba de entrar, arriba. Es el orden de todas las listas del
          panel: lo ultimo que paso es lo que el administrador esta mirando. Para
          ver quien lleva mas tiempo esta la columna "Tiempo adentro", que se
          puede leer de un vistazo porque corre sola.
        */
        .sort((a, b) => b.entradaMs - a.entradaMs)
    : [];

  const page = Math.max(1, Number(query.pagina) || 1);
  const totalPages = Math.max(1, Math.ceil(vehiculos.length / PAGE_SIZE));
  const enPantalla = vehiculos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const numero = (value: number | null) => value?.toLocaleString('es-CO') ?? '—';

  return (
    <>
      <PageHeader
        title="Adentro ahora"
        description="Los vehiculos dentro del parqueadero y cuanto tiempo llevan."
        action={<AutoRefresh />}
      />

      {!inside.ok ? (
        <SourceNotice result={inside} what="Vehiculos adentro" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <Stat label="Total adentro" value={numero(inside.data.total)} tone="accent" />
            <Stat label="Carros" value={numero(inside.data.cars)} />
            <Stat label="Motos" value={numero(inside.data.motorcycles)} />
            <Stat label="Bicicletas" value={numero(inside.data.bicycles)} />
            <Stat label="Patinetas" value={numero(inside.data.scooters)} />
          </div>

          <div className="mt-4">
            <Card className="overflow-hidden">
              <CardTitle
                title="Vehiculos"
                description={`${numero(inside.data.monthly)} con mensualidad · ${numero(inside.data.regular)} ocasionales${
                  inside.data.undefinedType ? ` · ${inside.data.undefinedType} sin placa por definir` : ''
                }`}
              />
              {vehiculos.length === 0 ? (
                <EmptyState
                  title="El parqueadero esta vacio"
                  description="No hay ningun vehiculo adentro en este momento."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[56rem] text-sm">
                      <TableHead>
                        <Th first>Foto</Th>
                        <Th>Codigo</Th>
                        <Th>Placa</Th>
                        <Th>Tipo</Th>
                        <Th>Entrada</Th>
                        <Th>Tiempo adentro</Th>
                        <Th last>Pago</Th>
                      </TableHead>
                      <TableBody>
                        {enPantalla.map((vehiculo) => (
                          <Row key={vehiculo.ticketId}>
                            {/* Foto de la entrada: aqui es lo mas util de la fila,
                                porque son los vehiculos que estan ahi afuera
                                ahora mismo y se comparan con lo que se ve. */}
                            <td className="py-2 pl-5 pr-4">
                              <VehiclePhoto
                                src={vehiculo.photo}
                                slug={slug}
                                label={vehiculo.plate ?? vehiculo.code ?? 'vehiculo'}
                                size="wide"
                              />
                            </td>
                            <td className="tnum whitespace-nowrap py-3 pr-4 font-medium text-ink-100">
                              {vehiculo.code ?? <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="px-4 py-3 font-medium text-ink-100">
                              {vehiculo.plate ?? (
                                <span className="font-normal text-[var(--text-muted)]">Sin placa</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {vehiculo.vehicleType ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                              {formatUpstreamDate(vehiculo.checkedInAt)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-ink-100">
                              <LiveDuration since={vehiculo.entradaIso} />
                            </td>
                            <td className="py-3 pl-4 pr-5">
                              {vehiculo.mensualidad ? (
                                <Badge tone="ok">Mensualidad</Badge>
                              ) : (
                                <Badge tone="warn">Pendiente</Badge>
                              )}
                            </td>
                          </Row>
                        ))}
                      </TableBody>
                    </table>
                  </div>
                  {totalPages > 1 ? (
                    <Pager
                      basePath={`/p/${slug}/adentro`}
                      page={page}
                      totalPages={totalPages}
                      query={query}
                    />
                  ) : null}
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
        tone === 'ok'
          ? 'bg-ok-500/12 text-ok-300 ring-ok-400/25'
          : 'bg-warn-500/12 text-warn-300 ring-warn-400/25'
      }`}
    >
      {children}
    </span>
  );
}
