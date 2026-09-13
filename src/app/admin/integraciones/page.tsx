import Link from 'next/link';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { getRedebanStatus } from '@/lib/parking/redeban';
import { getSiigoStatus } from '@/lib/parking/siigo';
import { PageHeader } from '@/components/app-shell';
import { Alert, Card, CardHeader, EmptyState } from '@/components/ui';

export const metadata = { title: 'Integraciones' };

/**
 * Estado de las integraciones de todos los parqueaderos.
 *
 * Es una vista de control, no un formulario: **todo se configura en la ficha de
 * cada sitio**, porque las tres integraciones son propias de cada uno — su
 * sistema, su datafono y su empresa facturadora. Aqui se ve de un vistazo cual
 * quedo a medias y se llega a el en un clic.
 */
export default async function IntegrationsPage() {
  await requireRole('SUPERADMIN');

  const lots = await db.parkingLot.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, novaBaseUrl: true },
  });

  const status = await Promise.all(
    lots.map(async (lot) => ({
      ...lot,
      redeban: await getRedebanStatus(lot.id),
      siigo: await getSiigoStatus(lot.id),
    })),
  );

  const incomplete = status.filter(
    (lot) => !lot.novaBaseUrl || !lot.redeban.configured || !lot.siigo.configured,
  );

  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Cada parqueadero se conecta con su propio sistema, su propio datafono y su propia empresa facturadora. Aqui ves el estado de todos."
      />

      {incomplete.length > 0 ? (
        <div className="mb-6">
          <Alert tone="warning" title="Hay sitios sin terminar de configurar">
            {incomplete.map((lot) => lot.name).join(', ')}. Un parqueadero sin
            sistema no puede consultar vehiculos; sin datafono no puede cobrar; y
            sin facturacion cobra pero deja las facturas pendientes.
          </Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Estado por parqueadero"
          description="Entra a la ficha de un sitio para configurar cualquiera de las tres."
        />

        {status.length === 0 ? (
          <EmptyState
            title="No hay parqueaderos"
            description="Crea el primero en la seccion Parqueaderos."
          />
        ) : (
          <ul className="divide-y divide-[var(--line-subtle)]">
            {status.map((lot) => (
              <li key={lot.id}>
                <Link
                  href={`/admin/parqueaderos/${lot.slug}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-100">{lot.name}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-muted)]">
                      {lot.novaBaseUrl ?? 'Sistema sin configurar'}
                    </p>
                  </div>

                  <dl className="flex shrink-0 flex-wrap gap-x-6 gap-y-2">
                    <Flag ok={Boolean(lot.novaBaseUrl)} label="Sistema" />
                    <Flag
                      ok={lot.redeban.configured}
                      label="Datafono"
                      hint={lot.redeban.codigoTerminal ?? undefined}
                    />
                    <Flag
                      ok={lot.siigo.configured}
                      label="Facturacion"
                      hint={
                        lot.siigo.configured && !lot.siigo.enabled
                          ? 'desactivada'
                          : undefined
                      }
                    />
                  </dl>

                  <span className="shrink-0 text-[13px] font-medium text-brand-300">
                    Configurar
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Flag({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <div className="text-xs">
      <dt
        className={`inline-flex items-center gap-1.5 font-medium ${
          ok ? 'text-ok-300' : 'text-warn-300'
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-ok-400' : 'bg-warn-400'}`}
        />
        {label}
      </dt>
      {hint ? (
        <dd className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
          {hint}
        </dd>
      ) : null}
    </div>
  );
}
