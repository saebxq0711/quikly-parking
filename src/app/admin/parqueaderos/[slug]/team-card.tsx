'use client';

import { useState } from 'react';
import { MdAdd, MdExpandMore } from 'react-icons/md';
import { ActionForm } from '@/components/action-form';
import { Avatar } from '@/components/admin/directory';
import { Card, CardHeader, Field, Input, formatDateTime } from '@/components/ui';
import { PasswordInput } from '@/components/password-input';
import { UserActions } from '@/app/admin/usuarios/user-actions';
import { createUser } from '../../actions';
import { StatusPill } from './redeban-card';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  active: boolean;
  hasSession: boolean;
  lastLoginAt: string | null;
}

/**
 * Equipo del parqueadero: quienes ven su panel.
 *
 * Un administrador se crea desde el sitio al que pertenece, que es donde se piensa
 * en el ("quien maneja el 122"), y no desde una lista global en la que hay que
 * acordarse de elegir el parqueadero.
 */
export function TeamCard({
  parkingLotId,
  lotName,
  members,
}: {
  parkingLotId: string;
  lotName: string;
  members: TeamMember[];
}) {
  const activos = members.filter((m) => m.active).length;

  return (
    <Card>
      <CardHeader
        title="Equipo"
        description={`Quiénes administran ${lotName}. Ven su panel: lo que hay adentro, las cajas, los pagos y los reportes.`}
        action={<StatusPill ok={activos > 0} okLabel={`${activos} activo${activos === 1 ? '' : 's'}`} pendingLabel="Sin administrador" />}
      />

      {members.length === 0 ? (
        <p className="px-5 pt-5 text-sm text-[var(--text-secondary)]">
          Nadie administra este parqueadero todavía. Crea el primero abajo.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
      )}

      <div className="p-5">
        <details className="group rounded-xl ring-1 ring-inset ring-dashed ring-[var(--ring-soft)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] [&::-webkit-details-marker]:hidden">
            <MdAdd className="h-5 w-5 transition-transform duration-200 group-open:rotate-45" aria-hidden focusable="false" />
            Agregar administrador
          </summary>
          <div className="page-in border-t border-[var(--line-subtle)] px-4 py-4">
            <ActionForm action={createUser} submitLabel="Crear administrador" submitVariant="confirm">
              <input type="hidden" name="role" value="ADMIN_PARQUEADERO" />
              <input type="hidden" name="parkingLotId" value={parkingLotId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre completo">
                  <Input name="name" required minLength={3} placeholder="María Rodríguez" autoComplete="off" />
                </Field>
                <Field label="Correo" hint="Con este correo entra al panel.">
                  <Input name="email" type="email" required placeholder="admin@parqueadero.co" autoComplete="off" />
                </Field>
                <Field label="Contraseña" hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números.">
                  <PasswordInput name="password" required minLength={10} autoComplete="new-password" />
                </Field>
                <Field label="Confirma la contraseña">
                  <PasswordInput name="confirmPassword" required minLength={10} autoComplete="new-password" />
                </Field>
              </div>
              <p className="text-[13px] text-[var(--text-muted)]">
                Entrégale su correo y su contraseña por tu canal habitual.
              </p>
            </ActionForm>
          </div>
        </details>
      </div>
    </Card>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <Avatar name={member.name} muted={!member.active} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            {member.name}
            {!member.active ? <Chip tone="muted">Inactivo</Chip> : null}
            {member.hasSession ? <Chip tone="live">Sesión abierta</Chip> : null}
          </p>
          <p className="break-all text-[13px] text-[var(--text-muted)]">{member.email}</p>
          <p className="tnum text-[13px] text-[var(--text-muted)]">
            {member.lastLoginAt ? `Último ingreso ${formatDateTime(member.lastLoginAt)}` : 'Nunca ha ingresado'}
          </p>
        </div>
        </div>
        <button
          type="button"
          onClick={() => setAbierta((valor) => !valor)}
          aria-expanded={abierta}
          className="inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-full px-3 sm:self-auto text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)]"
        >
          Gestionar
          <MdExpandMore className={`h-4 w-4 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`} aria-hidden focusable="false" />
        </button>
      </div>
      {abierta ? (
        <div className="page-in mt-4 rounded-xl bg-[var(--fill-soft)] p-4 ring-1 ring-inset ring-[var(--line-subtle)]">
          <UserActions userId={member.id} active={member.active} hasSession={member.hasSession} isSelf={false} />
        </div>
      ) : null}
    </li>
  );
}

function Chip({ tone, children }: { tone: 'muted' | 'live'; children: React.ReactNode }) {
  return (
    <span
      className={
        tone === 'live'
          ? 'inline-flex items-center gap-1.5 rounded-full bg-[var(--fill-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--ring-soft)]'
          : 'rounded-full bg-[var(--fill-soft-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] ring-1 ring-inset ring-[var(--ring-soft)]'
      }
    >
      {tone === 'live' ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok-500" aria-hidden /> : null}
      {children}
    </span>
  );
}
