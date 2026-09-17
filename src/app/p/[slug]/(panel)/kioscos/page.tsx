import { MdPointOfSale } from 'react-icons/md';
import { db } from '@/lib/db';
import { panelAccess } from '@/lib/parking/panel-access';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState, formatCOP, formatDateTime } from '@/components/ui';
import { AutoRefresh } from '@/components/panel/auto-refresh';
import { KioskLogoutButton } from './logout-button';

export const metadata = { title: 'Kioscos' };

/**
 * Kioscos de pago del parqueadero, para su administrador: si cada pantalla esta en
 * linea, lo cobrado hoy y el cierre de sesion a distancia. Los kioscos se crean y se
 * configuran (datafono, impresora) desde el SuperAdmin.
 */
export default async function KiosksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { lot } = await panelAccess(slug);

  const ahora = new Date();
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);

  const [kioscos, cobrosHoy] = await Promise.all([
    db.paymentPoint.findMany({
      where: { parkingLotId: lot.id },
      orderBy: { createdAt: 'asc' },
      include: {
        users: {
          where: { role: 'PUNTO_PAGO' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            email: true,
            lastLoginAt: true,
            _count: {
              select: { sessions: { where: { revokedAt: null, expiresAt: { gt: ahora } } } },
            },
          },
        },
      },
    }),
    db.payment.groupBy({
      by: ['paymentPointId'],
      where: {
        parkingLotId: lot.id,
        status: 'APPROVED',
        createdAt: { gte: new Date(`${hoy}T00:00:00-05:00`) },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const porKiosco = new Map(cobrosHoy.map((fila) => [fila.paymentPointId, fila]));

  return (
    <>
      <PageHeader
        title="Kioscos"
        description="Las pantallas de pago de tu parqueadero. Si una queda con la sesion abierta de mas, cierrala desde aqui."
        action={<AutoRefresh />}
      />

      {kioscos.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin kioscos"
            description="Este parqueadero todavia no tiene kioscos de pago. Los crea el administrador de la plataforma."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kioscos.map((kiosco) => {
            const usuario = kiosco.users[0];
            const enLinea = (usuario?._count.sessions ?? 0) > 0;
            const cobros = porKiosco.get(kiosco.id);
            return (
              <Card key={kiosco.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-200 ring-1 ring-inset ring-brand-400/25">
                    <MdPointOfSale className="h-5 w-5" aria-hidden focusable="false" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink-50">{kiosco.name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {usuario?.email ?? 'Sin usuario de acceso'}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                      !kiosco.active
                        ? 'bg-white/[0.05] text-[var(--text-muted)] ring-white/10'
                        : enLinea
                          ? 'bg-ok-500/12 text-ok-300 ring-ok-400/30'
                          : 'bg-white/[0.05] text-[var(--text-secondary)] ring-white/10'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        kiosco.active && enLinea ? 'live-dot bg-ok-400' : 'bg-ink-600'
                      }`}
                    />
                    {!kiosco.active ? 'Fuera de servicio' : enLinea ? 'En linea' : 'Sin sesion'}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Pagos hoy</dt>
                    <dd className="tnum mt-1 text-xl font-semibold text-ink-50">{cobros?._count._all ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Recaudado hoy</dt>
                    <dd className="tnum mt-1 text-xl font-semibold text-ink-50">
                      {formatCOP(cobros?._sum.amount ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Impresora</dt>
                    <dd className="mt-1 text-ink-200">{kiosco.hasPrinter ? 'Si' : 'No, comprobante en pantalla'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Ultimo ingreso</dt>
                    <dd className="mt-1 text-ink-200">
                      {usuario?.lastLoginAt ? formatDateTime(usuario.lastLoginAt) : 'Nunca'}
                    </dd>
                  </div>
                </dl>

                {usuario ? (
                  <div className="mt-5 border-t border-[var(--line-subtle)] pt-4">
                    <KioskLogoutButton userId={usuario.id} enLinea={enLinea} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
