import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getVehiclesInside } from '@/integrations/nova-parking/panel';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState } from '@/components/ui';
import {
  Row,
  SourceNotice,
  Stat,
  TableBody,
  TableHead,
  Th,
  formatUpstreamDate,
} from '@/components/panel/pieces';
import { DownloadButton } from '@/components/panel/download-button';

export const metadata = { title: 'Adentro ahora' };

/**
 * Quien esta adentro en este momento.
 *
 * Es una foto del presente, no un historial: lo que Nova Parking considera
 * "dentro" son los tiquetes en estado IN sin anular. Para lo demas esta la
 * pantalla de historial.
 *
 * No se muestra el numero interno del tiquete: es el autoincremental de Nova
 * Parking y no le dice nada al administrador (ni al cliente).
 */
export default async function InsidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { client } = await panelAccess(slug);
  const inside = client ? await getVehiclesInside(client) : NO_SOURCE;

  return (
    <>
      <PageHeader
        title="Adentro ahora"
        description="Los vehiculos que estan dentro del parqueadero en este momento."
        action={
          inside.ok && inside.data.vehicles.length > 0 ? (
            <DownloadButton
              filename={`adentro-${slug}`}
              columns={[
                { key: 'plate', label: 'Placa' },
                { key: 'vehicleType', label: 'Tipo' },
                { key: 'checkedInAt', label: 'Ingreso' },
                { key: 'clientKind', label: 'Cliente' },
              ]}
              rows={inside.data.vehicles as unknown as Record<string, unknown>[]}
            />
          ) : null
        }
      />

      {!inside.ok ? (
        <SourceNotice result={inside} what="Vehiculos adentro" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <Stat
              label="Total adentro"
              value={inside.data.total.toLocaleString('es-CO')}
              tone="accent"
            />
            <Stat
              label="Carros"
              value={inside.data.cars?.toLocaleString('es-CO') ?? '—'}
            />
            <Stat
              label="Motos"
              value={inside.data.motorcycles?.toLocaleString('es-CO') ?? '—'}
            />
            <Stat
              label="Bicicletas"
              value={inside.data.bicycles?.toLocaleString('es-CO') ?? '—'}
            />
            <Stat
              label="Patinetas"
              value={inside.data.scooters?.toLocaleString('es-CO') ?? '—'}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Con mensualidad"
              value={inside.data.monthly?.toLocaleString('es-CO') ?? '—'}
            />
            <Stat
              label="Ocasionales"
              value={inside.data.regular?.toLocaleString('es-CO') ?? '—'}
            />
            {inside.data.undefinedType ? (
              <Stat
                label="Sin placa, por definir"
                value={inside.data.undefinedType.toLocaleString('es-CO')}
                hint="Motos, bicicletas o patinetas: el tipo se elige al pagar"
              />
            ) : null}
          </div>

          <div className="mt-4">
            <Card>
              {inside.data.vehicles.length === 0 ? (
                <EmptyState
                  title="El parqueadero esta vacio"
                  description="No hay ningun vehiculo adentro en este momento."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <TableHead>
                      <Th first>Placa</Th>
                      <Th>Tipo</Th>
                      <Th>Ingreso</Th>
                      <Th last>Cliente</Th>
                    </TableHead>
                    <TableBody>
                      {inside.data.vehicles.map((vehicle) => (
                        <Row key={vehicle.ticketId}>
                          <td className="py-3 pl-5 pr-4 font-medium text-ink-100">
                            {vehicle.plate ?? (
                              <span className="font-normal text-[var(--text-muted)]">
                                Sin placa
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {vehicle.vehicleType ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                            {formatUpstreamDate(vehicle.checkedInAt)}
                          </td>
                          <td className="py-3 pl-4 pr-5 text-[var(--text-secondary)]">
                            {vehicle.clientKind ?? '—'}
                          </td>
                        </Row>
                      ))}
                    </TableBody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
