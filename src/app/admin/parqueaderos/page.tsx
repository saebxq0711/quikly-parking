import Link from 'next/link';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { getRedebanStatus } from '@/lib/parking/redeban';
import { PageHeader } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { Card, CardHeader, EmptyState, Field, Input } from '@/components/ui';
import { createParkingLot } from '../actions';
import { ParkingLotDataFields } from './lot-fields';

export const metadata = { title: 'Parqueaderos' };

/**
 * Listado de parqueaderos.
 *
 * Cada uno es un sistema independiente con su propio dominio y su propio
 * datafono, asi que lo que hay que ver de un vistazo es si esta listo para
 * operar y que le falta. El detalle vive en su ficha: meterlo todo aqui
 * convertia la lista en un formulario ilegible.
 */
export default async function ParkingLotsPage() {
  await requireRole('SUPERADMIN');

  const lots = await db.parkingLot.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      paymentPoint: { select: { id: true } },
      _count: { select: { users: true, payments: true } },
    },
  });

  // Estado de cada sitio: sin esto habria que entrar uno por uno para saber
  // cual quedo a medio configurar.
  const status = await Promise.all(
    lots.map(async (lot) => ({
      id: lot.id,
      redeban: await getRedebanStatus(lot.id),
    })),
  );
  const redebanById = new Map(status.map((s) => [s.id, s.redeban]));

  return (
    <>
      <PageHeader
        title="Parqueaderos"
        description="Cada parqueadero tiene su propio sistema, su propio datafono y su propio punto de pago. Sus usuarios solo ven la informacion de su sitio."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="overflow-hidden">
          {lots.length === 0 ? (
            <EmptyState
              title="Todavia no hay parqueaderos"
              description="Crea el primero con el formulario de la derecha. Se creara con su punto de pago listo para configurar."
            />
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)]">
              {lots.map((lot) => {
                const redeban = redebanById.get(lot.id);
                const pending: string[] = [];
                if (!lot.novaBaseUrl) pending.push('sistema');
                if (!redeban?.configured) pending.push('datafono');
                if (!lot.paymentPoint) pending.push('punto de pago');
                if (lot._count.users === 0) pending.push('usuarios');

                return (
                  <li key={lot.id}>
                    <Link
                      href={`/admin/parqueaderos/${lot.slug}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-ink-100">
                            {lot.name}
                          </p>
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            /{lot.slug}
                          </span>
                          {!lot.active ? (
                            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-ink-400 ring-1 ring-inset ring-white/15">
                              Inactivo
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1.5 text-xs">
                          {pending.length === 0 ? (
                            <span className="text-ok-300">
                              Listo para operar
                            </span>
                          ) : (
                            <span className="text-warn-300">
                              Falta configurar: {pending.join(', ')}
                            </span>
                          )}
                        </p>
                      </div>

                      <dl className="hidden shrink-0 gap-6 text-right sm:flex">
                        <Stat label="Usuarios" value={lot._count.users} />
                        <Stat label="Pagos" value={lot._count.payments} />
                      </dl>

                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                        aria-hidden="true"
                      >
                        <path
                          d="m9.5 5.5 6.5 6.5-6.5 6.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Nuevo parqueadero"
            description="Su conexion y su datafono se configuran despues, en la ficha del sitio."
          />
          <div className="p-5">
            <ActionForm action={createParkingLot} submitLabel="Crear parqueadero">
              <Field label="Nombre">
                <Input name="name" required placeholder="Parqueadero 122" />
              </Field>
              <Field
                label="Identificador"
                hint="Se usa en la direccion web. Minusculas, numeros y guiones."
              >
                <Input name="slug" required placeholder="122" spellCheck={false} />
              </Field>
              <ParkingLotDataFields compacto />
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="tnum text-sm font-medium text-ink-200">{value}</dd>
    </div>
  );
}
