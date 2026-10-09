import Link from 'next/link';
import { MdAdd, MdArrowForward, MdLocalParking, MdPointOfSale, MdPrint } from 'react-icons/md';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { requireRole } from '@/lib/auth/guards';
import { getLotOverview, type LotOverview } from '@/lib/parking/readiness';
import { PageHeader } from '@/components/app-shell';
import { Card, buttonClassName } from '@/components/ui';
import { Avatar, LotStatus, ReadinessRail } from '@/components/admin/directory';

export const metadata = { title: 'Parqueaderos' };

/**
 * Directorio de parqueaderos.
 *
 * La unidad es el sitio con su gente: en un bloque se ve si esta listo para
 * operar, que le falta (cada punto enlaza a su seccion de la ficha), quien lo
 * administra y como estan sus kioscos. Crear un sitio tiene su propia pagina:
 * antes un formulario de trece campos, siempre abierto, ocupaba media pantalla
 * para algo que se hace pocas veces.
 */
export default async function ParkingLotsPage() {
  await requireRole('SUPERADMIN');

  const lots = await db.parkingLot.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      city: true,
      legalName: true,
      nit: true,
      address: true,
      insurancePolicy: true,
      _count: { select: { payments: true } },
    },
  });

  const resumenes = await Promise.all(lots.map((lot) => getLotOverview(lot)));
  const listos = lots.filter((lot, i) => lot.active && resumenes[i].pending === 0).length;
  const base = env.APP_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const descripcion =
    lots.length === 0
      ? 'Cada parqueadero tiene su propio sistema, sus kioscos de pago y su facturación.'
      : `${lots.length} ${lots.length === 1 ? 'parqueadero' : 'parqueaderos'} · ${
          listos === lots.length
            ? listos === 1
              ? 'listo para operar'
              : 'todos listos para operar'
            : `${listos} listo${listos === 1 ? '' : 's'}, ${lots.length - listos} por terminar`
        }`;

  return (
    <>
      <PageHeader
        title="Parqueaderos"
        description={descripcion}
        action={
          <Link href="/admin/parqueaderos/nuevo" className={buttonClassName('primary', 'md')}>
            <MdAdd className="h-5 w-5" aria-hidden focusable="false" />
            Nuevo parqueadero
          </Link>
        }
      />

      {lots.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--fill-soft)] text-[var(--text-secondary)]">
            <MdLocalParking className="h-7 w-7" aria-hidden focusable="false" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">Todavía no hay parqueaderos</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
            Crea el primero con los datos de su empresa. Después le conectas su sistema, le
            agregas los kioscos con su datáfono y le activas la facturación.
          </p>
          <Link href="/admin/parqueaderos/nuevo" className={buttonClassName('primary', 'md', 'mt-6')}>
            <MdAdd className="h-5 w-5" aria-hidden focusable="false" />
            Crear el primer parqueadero
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {lots.map((lot, i) => (
            <LotBlock
              key={lot.id}
              lot={lot}
              overview={resumenes[i]}
              kioskUrl={`${base}/p/${lot.slug}/pos`}
            />
          ))}
        </div>
      )}
    </>
  );
}

function LotBlock({
  lot,
  overview,
  kioskUrl,
}: {
  lot: { name: string; slug: string; active: boolean; city: string | null; _count: { payments: number } };
  overview: LotOverview;
  kioskUrl: string;
}) {
  const ficha = `/admin/parqueaderos/${lot.slug}`;

  return (
    <Card className="overflow-hidden">
      <article aria-labelledby={`sitio-${lot.slug}`}>
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-6 pb-5 pt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id={`sitio-${lot.slug}`} className="text-xl font-bold tracking-[-0.01em] text-[var(--text-primary)]">
                {lot.name}
              </h2>
              <LotStatus pending={overview.pending} active={lot.active} />
            </div>
            <p className="mt-1.5 truncate text-[13px] text-[var(--text-muted)]">
              {lot.city ? `${lot.city} · ` : ''}
              <span className="tnum">{kioskUrl}</span>
            </p>
          </div>
          <Link href={ficha} className={buttonClassName('secondary', 'sm', 'shrink-0 px-4')}>
            Configurar
            <MdArrowForward className="h-4 w-4" aria-hidden focusable="false" />
          </Link>
        </header>

        <div className="px-6 pb-6">
          <ReadinessRail items={overview.readiness} slug={lot.slug} />
        </div>

        <div className="grid border-t border-[var(--line-subtle)] md:grid-cols-2 md:divide-x md:divide-[var(--line-subtle)]">
          <section className="px-6 py-5" aria-label={`Equipo de ${lot.name}`}>
            <SectionLabel title="Equipo" count={overview.admins.length} />
            {overview.admins.length === 0 ? (
              <EmptyLine text="Nadie administra este parqueadero todavía." href={`${ficha}#equipo`} action="Agregar administrador" />
            ) : (
              <ul className="space-y-3">
                {overview.admins.map((admin) => (
                  <li key={admin.id} className="flex items-center gap-3">
                    <Avatar name={admin.name} muted={!admin.active} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {admin.name}
                        {!admin.active ? <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">Inactivo</span> : null}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{admin.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-[var(--line-subtle)] px-6 py-5 md:border-t-0" aria-label={`Kioscos de ${lot.name}`}>
            <SectionLabel title="Kioscos" count={overview.kiosks.length} />
            {overview.kiosks.length === 0 ? (
              <EmptyLine text="Sin kioscos: este parqueadero no puede cobrar." href={`${ficha}#kioscos`} action="Agregar kiosco" />
            ) : (
              <ul className="space-y-3">
                {overview.kiosks.map((kiosk) => (
                  <li key={kiosk.id} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--fill-soft)] text-[var(--text-secondary)]">
                      <MdPointOfSale className="h-4 w-4" aria-hidden focusable="false" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {kiosk.name}
                        {!kiosk.active ? <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">Fuera de servicio</span> : null}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                        <span className={kiosk.datafonoListo ? '' : 'font-medium text-warn-700'}>
                          {kiosk.datafonoListo ? 'Datáfono listo' : 'Sin datáfono'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {kiosk.hasPrinter ? <MdPrint className="h-3.5 w-3.5" aria-hidden focusable="false" /> : null}
                          {kiosk.hasPrinter ? 'Con impresora' : 'Sin impresora'}
                        </span>
                      </p>
                    </div>
                    <OnlineState online={kiosk.enLinea} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--line-subtle)] bg-[var(--fill-soft)] px-6 py-3 text-[13px] text-[var(--text-muted)]">
          <span>
            <span className="tnum font-semibold text-[var(--text-secondary)]">{lot._count.payments.toLocaleString('es-CO')}</span>{' '}
            {lot._count.payments === 1 ? 'cobro registrado en el kiosco' : 'cobros registrados en el kiosco'}
          </span>
        </footer>
      </article>
    </Card>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="mb-3.5 flex items-baseline gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
      {title}
      <span className="tnum text-[12px] font-medium text-[var(--text-muted)]">{count}</span>
    </h3>
  );
}

function EmptyLine({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      {text}{' '}
      <Link
        href={href}
        className="font-medium text-[var(--text-primary)] underline decoration-brand-500 decoration-2 underline-offset-4 transition-colors duration-150 hover:decoration-[var(--text-primary)]"
      >
        {action}
      </Link>
    </p>
  );
}

function OnlineState({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${
        online ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'live-dot bg-ok-500' : 'bg-ink-300'}`} aria-hidden />
      {online ? 'En línea' : 'Sin sesión'}
    </span>
  );
}
