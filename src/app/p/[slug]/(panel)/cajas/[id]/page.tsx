import Link from 'next/link';
import { MdArrowBack } from 'react-icons/md';
import { panelAccess, NO_SOURCE } from '@/lib/parking/panel-access';
import { getCashBox } from '@/integrations/nova-parking/panel';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState, formatCOP } from '@/components/ui';
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

export const metadata = { title: 'Movimientos de caja' };

/** Los tipos de movimiento que registra Nova Parking en su `POSLog`. */
const MOVEMENT_LABEL: Record<string, string> = {
  OPEN: 'Apertura',
  CLOSE: 'Cierre',
  TICKET: 'Cobro de tiquete',
  MONTHLY: 'Mensualidad',
  MISCELLANEOUS: 'Otro servicio',
  WITHDRAW: 'Retiro',
  DEPOSIT: 'Ingreso de efectivo',
};

/**
 * La nota del movimiento, legible.
 *
 * Los cobros del kiosco de pago dejan en la nota el id de la transaccion del
 * datafono (`Redeban transaction_id=...`): eso es un dato de conciliacion, no algo
 * que el administrador lea. Se muestra como lo que es.
 */
function detalle(comment: string | null): string {
  if (!comment) return '—';
  const texto = comment.trim();
  if (/transaction_id=/i.test(texto)) return 'Pago con tarjeta en el kiosco';
  if (texto.startsWith('{') || texto.startsWith('[')) return '—';
  return texto;
}

export default async function CashBoxDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { client } = await panelAccess(slug);
  const result = client ? await getCashBox(client, id) : NO_SOURCE;

  const box = result.ok ? result.data : null;
  const filas = box
    ? box.movements.map((m) => ({
        ...m,
        movimiento: MOVEMENT_LABEL[m.kind] ?? m.kind,
        detalle: detalle(m.comment),
      }))
    : [];

  return (
    <>
      <PageHeader
        title={box?.name ?? 'Caja'}
        description="Cada movimiento registrado en esta caja."
        back={
          <Link
            href={`/p/${slug}/cajas`}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-ink-100"
          >
            <MdArrowBack className="h-4 w-4" aria-hidden focusable="false" />
            Volver a cajas
          </Link>
        }
        action={
          box && filas.length > 0 ? (
            <DownloadButton
              filename={`caja-${box.name.replace(/\s+/g, '-').toLowerCase()}`}
              columns={[
                { key: 'at', label: 'Fecha' },
                { key: 'movimiento', label: 'Movimiento' },
                { key: 'responsible', label: 'Responsable' },
                { key: 'amount', label: 'Valor' },
                { key: 'cashAfter', label: 'Saldo' },
                { key: 'detalle', label: 'Detalle' },
              ]}
              rows={filas as unknown as Record<string, unknown>[]}
            />
          ) : null
        }
      />

      {!result.ok ? (
        <SourceNotice result={result} what="Movimientos de caja" />
      ) : !box ? (
        <EmptyState
          title="Esta caja no existe"
          description="El parqueadero no tiene ninguna caja con ese identificador."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Estado"
              value={box.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
              hint={box.responsibleName ?? undefined}
            />
            <Stat
              label="Efectivo en caja"
              value={box.cashAvailable !== null ? formatCOP(box.cashAvailable) : '—'}
              tone="accent"
            />
            <Stat
              label="Movimientos"
              value={String(filas.length)}
              hint="Los mas recientes primero"
            />
          </div>

          <div className="mt-4">
            <Card>
              {filas.length === 0 ? (
                <EmptyState
                  title="Sin movimientos"
                  description="Esta caja todavia no registra ninguna operacion."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] text-sm">
                    <TableHead>
                      <Th first>Fecha</Th>
                      <Th>Movimiento</Th>
                      <Th>Responsable</Th>
                      <Th align="right">Valor</Th>
                      <Th align="right">Saldo</Th>
                      <Th last>Detalle</Th>
                    </TableHead>
                    <TableBody>
                      {filas.map((movement) => (
                        <Row key={movement.id}>
                          <td className="whitespace-nowrap py-3 pl-5 pr-4 text-[var(--text-secondary)]">
                            {formatUpstreamDate(movement.at)}
                          </td>
                          <td className="px-4 py-3 font-medium text-ink-100">
                            {movement.movimiento}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {movement.responsible ?? '—'}
                          </td>
                          <td className="tnum whitespace-nowrap px-4 py-3 text-right font-medium text-ink-100">
                            {movement.amount !== null ? formatCOP(movement.amount) : '—'}
                          </td>
                          <td className="tnum whitespace-nowrap px-4 py-3 text-right text-[var(--text-secondary)]">
                            {movement.cashAfter !== null ? formatCOP(movement.cashAfter) : '—'}
                          </td>
                          <td className="max-w-xs truncate py-3 pl-4 pr-5 text-[var(--text-muted)]">
                            {movement.detalle}
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
