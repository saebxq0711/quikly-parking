import Link from 'next/link';
import { MdArrowBack } from 'react-icons/md';
import { env } from '@/lib/env';
import { requireRole } from '@/lib/auth/guards';
import { PageHeader } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { Card, buttonClassName } from '@/components/ui';
import { createParkingLot } from '../../actions';
import { CompanyFields, LocationFields, PolicyFields } from '../lot-fields';
import { IdentityFields } from '../identity-fields';

export const metadata = { title: 'Nuevo parqueadero' };

/** Lo que se configura despues, en la ficha del sitio. */
const DESPUES = [
  { title: 'Sistema', text: 'La dirección y el token del sistema del parqueadero.' },
  { title: 'Kioscos', text: 'Cada pantalla de pago con su usuario, su datáfono y su impresora.' },
  { title: 'Facturación', text: 'Las credenciales de SIIGO de la empresa.' },
  { title: 'Equipo', text: 'Quiénes administran el parqueadero.' },
];

/**
 * Alta de un parqueadero.
 *
 * Solo pide lo que identifica al sitio y lo que va impreso en sus comprobantes.
 * Lo tecnico (sistema, datafono, SIIGO) se carga despues en su ficha, adonde se
 * llega al guardar: cuando se da de alta un sitio, esos datos casi nunca estan.
 */
export default async function NewParkingLotPage() {
  await requireRole('SUPERADMIN');
  const baseUrl = env.APP_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return (
    <>
      <PageHeader
        back={
          <Link
            href="/admin/parqueaderos"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)]"
          >
            <MdArrowBack className="h-4 w-4" aria-hidden focusable="false" />
            Parqueaderos
          </Link>
        }
        title="Nuevo parqueadero"
        description="Los datos de la empresa van en el comprobante y la factura de cada cliente. Lo técnico lo configuras después, en su ficha."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="px-6 py-7 sm:px-8">
          <ActionForm
            action={createParkingLot}
            submitLabel="Crear parqueadero"
            onSuccessReset={false}
            secondaryAction={
              <Link href="/admin/parqueaderos" className={buttonClassName('ghost', 'md')}>
                Cancelar
              </Link>
            }
          >
            <IdentityFields baseUrl={baseUrl} />
            <CompanyFields />
            <LocationFields />
            <PolicyFields />
          </ActionForm>
        </Card>

        <aside className="rounded-2xl bg-[var(--fill-soft)] px-5 py-5 ring-1 ring-inset ring-[var(--line-subtle)]">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Después de crearlo</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Llegas a su ficha y completas, en el orden que quieras:
          </p>
          <ol className="mt-4 space-y-3.5">
            {DESPUES.map((paso) => (
              <li key={paso.title} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden />
                <span className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{paso.title}.</span> {paso.text}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
