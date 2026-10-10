'use client';

import { MdAdd, MdExpandMore, MdPointOfSale } from 'react-icons/md';
import { ActionForm } from '@/components/action-form';
import { Card, CardHeader, Checkbox, EmptyState, Field, Input } from '@/components/ui';
import { PasswordInput } from '@/components/password-input';
import { UserActions } from '@/app/admin/usuarios/user-actions';
import { createKiosk, updateKiosk } from '../../actions';
import { RedebanForm, StatusPill } from './redeban-card';

export interface KioskView {
  id: string;
  name: string;
  active: boolean;
  hasPrinter: boolean;
  user: { id: string; email: string; active: boolean; activeSessions: number } | null;
  redeban: {
    baseUrl: string | null;
    codigoUnico: string | null;
    codigoTerminal: string | null;
    usuario: string | null;
    red: string;
    hasPassword: boolean;
    missing: string[];
  };
}

/**
 * Kioscos de pago del parqueadero.
 *
 * Cada kiosco es una pantalla con su propio usuario, su datafono y, si la usa, su
 * impresora. Desde aqui se crea, se le configura el datafono, se decide si imprime, se
 * le cambia la contrasena y se le cierra la sesion a distancia.
 */
export function KiosksCard({
  parkingLotId,
  kiosks,
}: {
  parkingLotId: string;
  kiosks: KioskView[];
}) {
  return (
    <Card>
      <CardHeader
        title="Kioscos de pago"
        description="Cada kiosco entra con su propio usuario y cobra con su propio datáfono. Algunos imprimen el comprobante; los demás lo muestran en pantalla y lo envían al correo."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--fill-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)]">
            <MdPointOfSale className="h-3.5 w-3.5" aria-hidden focusable="false" />
            {kiosks.length} {kiosks.length === 1 ? 'kiosco' : 'kioscos'}
          </span>
        }
      />

      <div>
        {kiosks.length === 0 ? (
          <EmptyState
            title="Sin kioscos todavía"
            description="Crea el primero: sin kiosco este parqueadero no puede cobrar."
          />
        ) : (
          kiosks.map((kiosk) => (
            <KioskItem
              key={kiosk.id}
              parkingLotId={parkingLotId}
              kiosk={kiosk}
              abierto={kiosk.redeban.missing.length > 0 || !kiosk.user}
            />
          ))
        )}

        <div className="p-5">
        <details className="group rounded-xl ring-1 ring-inset ring-dashed ring-[var(--ring-soft)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] [&::-webkit-details-marker]:hidden">
            <MdAdd className="h-5 w-5 transition-transform duration-200 group-open:rotate-45" aria-hidden focusable="false" />
            Nuevo kiosco
          </summary>
          <div className="page-in border-t border-[var(--line-subtle)] px-4 py-4">
            <ActionForm submitVariant="confirm" action={createKiosk} submitLabel="Crear kiosco">
              <input type="hidden" name="parkingLotId" value={parkingLotId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre del kiosco" hint="Dónde está, por ejemplo Salida principal.">
                  <Input name="name" required minLength={2} maxLength={60} placeholder="Salida principal" />
                </Field>
                <Field label="Correo de acceso" hint="Con este correo entra la pantalla del kiosco.">
                  <Input name="email" type="email" required placeholder="kiosco1@parqueadero.co" autoComplete="off" />
                </Field>
                <Field label="Contraseña" hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números.">
                  <PasswordInput name="password" required minLength={10} autoComplete="new-password" />
                </Field>
                <Field label="Confirma la contraseña">
                  <PasswordInput name="confirmPassword" required minLength={10} autoComplete="new-password" />
                </Field>
              </div>
              <div className="space-y-1.5">
                <Checkbox name="hasPrinter" label="Este kiosco tiene su propia impresora" />
                <p className="pl-6.5 text-xs leading-relaxed text-[var(--text-muted)]">
                  Déjala sin marcar si no tiene: el comprobante sale en pantalla. También se
                  marca sola al conectar la impresora desde el kiosco.
                </p>
              </div>
            </ActionForm>
          </div>
        </details>
        </div>
      </div>
    </Card>
  );
}

function KioskItem({
  parkingLotId,
  kiosk,
  abierto,
}: {
  parkingLotId: string;
  kiosk: KioskView;
  abierto: boolean;
}) {
  const datafonoListo = kiosk.redeban.missing.length === 0;
  const sesionAbierta = (kiosk.user?.activeSessions ?? 0) > 0;

  return (
    <details open={abierto} className="group border-b border-[var(--line-subtle)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 transition-colors duration-150 hover:bg-[var(--fill-soft)] [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fill-soft-hover)] text-[var(--text-primary)]">
          <MdPointOfSale className="h-5 w-5" aria-hidden focusable="false" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{kiosk.name}</span>
          <span className="block truncate text-xs text-[var(--text-muted)]">
            {kiosk.user?.email ?? 'Sin usuario de acceso'}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {!kiosk.active ? (
            <StatusPill ok={false} pendingLabel="Fuera de servicio" />
          ) : null}
          <StatusPill ok={datafonoListo} okLabel="Datáfono listo" pendingLabel="Sin datáfono" />
          <span className="inline-flex items-center rounded-full bg-[var(--fill-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)]">
            {kiosk.hasPrinter ? 'Con impresora' : 'Sin impresora'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
              sesionAbierta
                ? 'bg-brand-100 text-ink-950 ring-brand-300'
                : 'bg-[var(--fill-soft)] text-[var(--text-muted)] ring-[var(--ring-soft)]'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${sesionAbierta ? 'live-dot bg-brand-300' : 'bg-ink-600'}`} />
            {sesionAbierta ? 'En línea' : 'Sin sesión'}
          </span>
          <MdExpandMore
            className="h-5 w-5 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
            aria-hidden
            focusable="false"
          />
        </span>
      </summary>

      <div className="page-in grid gap-8 px-5 pb-6 pt-2 lg:grid-cols-2">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">Kiosco</h3>
            <ActionForm submitVariant="confirm" action={updateKiosk} submitLabel="Guardar kiosco" onSuccessReset={false}>
              <input type="hidden" name="paymentPointId" value={kiosk.id} />
              <Field label="Nombre">
                <Input name="name" required defaultValue={kiosk.name} />
              </Field>
              <div className="space-y-2.5">
                <Checkbox name="hasPrinter" defaultChecked={kiosk.hasPrinter} label="Imprime el comprobante" />
                <p className="pl-6.5 text-xs leading-relaxed text-[var(--text-muted)]">
                  Sin impresora, el comprobante se muestra en pantalla y se envía al correo del
                  cliente si lo dio.
                </p>
                <Checkbox name="active" defaultChecked={kiosk.active} label="En servicio" />
              </div>
            </ActionForm>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-semibold text-[var(--text-primary)]">Acceso de la pantalla</h3>
            {kiosk.user ? (
              <>
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  {kiosk.user.email} ·{' '}
                  {sesionAbierta ? 'la pantalla tiene la sesión abierta' : 'sin sesión abierta'}
                  {' '}(la cierra a distancia el administrador del parqueadero, desde su panel)
                </p>
                <UserActions
                  allowLogout={false}
                  userId={kiosk.user.id}
                  active={kiosk.user.active}
                  hasSession={sesionAbierta}
                  isSelf={false}
                />
              </>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Este kiosco no tiene usuario. Crea uno nuevo para que su pantalla pueda entrar.
              </p>
            )}
          </section>
        </div>

        <section>
          <h3 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">Datáfono Redeban</h3>
          <RedebanForm parkingLotId={parkingLotId} paymentPointId={kiosk.id} {...kiosk.redeban} />
        </section>
      </div>
    </details>
  );
}
