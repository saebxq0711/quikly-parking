import Link from 'next/link';
import { MdChevronRight } from 'react-icons/md';
import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getCashBoxes } from '@/integrations/nova-parking/panel';
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

export const metadata = { title: 'Cajas' };

function BoxStatus({ status }: { status: string }) {
  const open = status === 'OPEN';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
        open
          ? 'bg-ok-500/12 text-ok-300 ring-ok-400/25'
          : 'bg-white/[0.06] text-[var(--text-secondary)] ring-[var(--line-subtle)]'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-ok-400' : 'bg-ink-500'}`}
      />
      {open ? 'Abierta' : 'Cerrada'}
    </span>
  );
}

/**
 * Las cajas del parqueadero: cuales estan abiertas y quien las tiene.
 *
 * El detalle de cada una (sus movimientos) esta un nivel adentro, porque esa
 * consulta trae todo el historial de la caja y no vale la pena pagarla para
 * pintar una lista.
 */
export default async function CashBoxesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { client } = await panelAccess(slug);
  const result = client ? await getCashBoxes(client) : NO_SOURCE;

  const open = result.ok ? result.data.filter((b) => b.status === 'OPEN') : [];
  const automatic = result.ok ? result.data.filter((b) => b.automatic) : [];

  return (
    <>
      <PageHeader
        title="Cajas"
        description="Estado de cada caja del parqueadero y quien la esta operando."
      />

      {!result.ok ? (
        <SourceNotice result={result} what="Cajas" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Abiertas"
              value={String(open.length)}
              hint={open.length === 0 ? 'Ninguna en operacion' : undefined}
              tone="accent"
            />
            <Stat label="Total de cajas" value={String(result.data.length)} />
            <Stat
              label="Automaticas"
              value={String(automatic.length)}
              hint="Kioscos de pago, sin cajero"
            />
          </div>

          <div className="mt-4">
            <Card>
              {result.data.length === 0 ? (
                <EmptyState
                  title="No hay cajas registradas"
                  description="El parqueadero todavia no tiene ninguna caja creada."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-sm">
                    <TableHead>
                      <Th first>Caja</Th>
                      <Th>Estado</Th>
                      <Th>Responsable</Th>
                      <Th>Apertura</Th>
                      <Th>Ultimo movimiento</Th>
                      <Th last>{''}</Th>
                    </TableHead>
                    <TableBody>
                      {result.data.map((box) => (
                        <Row key={box.id}>
                          <td className="py-3 pl-5 pr-4 font-medium text-ink-100">
                            {box.name}
                            {box.automatic ? (
                              <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                                Automatica
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <BoxStatus status={box.status} />
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {box.responsibleName ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                            {formatUpstreamDate(box.openedAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                            {formatUpstreamDate(box.lastUsedAt)}
                          </td>
                          <td className="py-3 pl-4 pr-5 text-right">
                            <Link
                              href={`/p/${slug}/cajas/${box.id}`}
                              className="inline-flex items-center gap-0.5 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
                            >
                              Movimientos
                              <MdChevronRight
                                className="h-4 w-4"
                                aria-hidden
                                focusable="false"
                              />
                            </Link>
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
