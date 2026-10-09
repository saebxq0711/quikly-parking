'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MdAdd, MdArrowForward, MdClose, MdExpandMore, MdPointOfSale, MdSearch } from 'react-icons/md';
import type { Role } from '@prisma/client';
import { Avatar } from '@/components/admin/directory';
import { Button, Card, cn, formatDateTime } from '@/components/ui';
import { UserActions } from './user-actions';
import { UserForm } from './user-form';

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  hasSession: boolean;
  lastLoginAt: string | null;
  lotId: string | null;
  kioskName: string | null;
  isSelf: boolean;
}

export interface DirectoryGroup {
  /** `superadmin` o el id del parqueadero. */
  id: string;
  title: string;
  subtitle: string;
  href: string | null;
}

type Filtro = 'todos' | Role;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'SUPERADMIN', label: 'Super administradores' },
  { id: 'ADMIN_PARQUEADERO', label: 'Administradores' },
  { id: 'PUNTO_PAGO', label: 'Kioscos' },
];

const ROL: Record<Role, string> = {
  SUPERADMIN: 'Super administrador',
  ADMIN_PARQUEADERO: 'Administrador',
  PUNTO_PAGO: 'Kiosco',
};

/** Sin tildes y en minusculas, para buscar "maria" y encontrar "María". */
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Directorio de usuarios: buscador, filtro por rol, alta y grupos por parqueadero.
 *
 * Pocas personas (decenas a lo sumo): se filtra en el navegador, sin ir al
 * servidor en cada tecla.
 */
export function UsersWorkspace({
  users,
  groups,
  parkingLots,
}: {
  users: DirectoryUser[];
  groups: DirectoryGroup[];
  parkingLots: { id: string; name: string }[];
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [creando, setCreando] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Un enlace de una solicitud de contrasena (#usuario-<id>) abre esa fila.
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => {
    const abrirDesdeHash = () => {
      const id = window.location.hash.replace('#usuario-', '');
      if (window.location.hash.startsWith('#usuario-') && id) {
        setFiltro('todos');
        setBusqueda('');
        setAbierto(id);
      }
    };
    abrirDesdeHash();
    window.addEventListener('hashchange', abrirDesdeHash);
    return () => window.removeEventListener('hashchange', abrirDesdeHash);
  }, []);

  useEffect(() => {
    if (creando) panel.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, [creando]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return users.filter(
      (user) =>
        (filtro === 'todos' || user.role === filtro) &&
        (!q || normalizar(`${user.name} ${user.email} ${user.kioskName ?? ''}`).includes(q)),
    );
  }, [users, busqueda, filtro]);

  const conteo = (id: Filtro) => (id === 'todos' ? users.length : users.filter((u) => u.role === id).length);

  const porGrupo = groups
    .map((group) => ({
      group,
      members: visibles.filter((user) =>
        group.id === 'superadmin' ? user.role === 'SUPERADMIN' : user.role !== 'SUPERADMIN' && user.lotId === group.id,
      ),
    }))
    .filter(({ members }) => members.length > 0);

  // Alguien sin parqueadero que no es super administrador: no deberia pasar, pero no se esconde.
  const huerfanos = visibles.filter(
    (user) => user.role !== 'SUPERADMIN' && !groups.some((group) => group.id === user.lotId),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <span className="sr-only">Buscar usuario</span>
            <MdSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden focusable="false" />
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por nombre o correo"
              className="block h-11 w-full rounded-full border-0 bg-[var(--surface-raised)] pl-10 pr-4 text-sm text-[var(--text-primary)] ring-1 ring-inset ring-[var(--ring-soft)] placeholder:text-[var(--text-muted)] transition-shadow duration-150 hover:ring-[var(--ring-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]"
            />
          </label>
          <div role="group" aria-label="Filtrar por rol" className="flex flex-wrap gap-1.5">
            {FILTROS.map((opcion) => {
              const activo = filtro === opcion.id;
              return (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => setFiltro(opcion.id)}
                  aria-pressed={activo}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition-colors duration-150',
                    activo
                      ? 'bg-ink-950 text-white ring-ink-950'
                      : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-[var(--ring-soft)] hover:text-[var(--text-primary)] hover:ring-[var(--ring-strong)]',
                  )}
                >
                  {opcion.label}
                  <span className={cn('tnum text-[12px]', activo ? 'text-white/70' : 'text-[var(--text-muted)]')}>
                    {conteo(opcion.id)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setCreando((valor) => !valor)}
          aria-expanded={creando}
          variant={creando ? 'secondary' : 'primary'}
          className="shrink-0 self-start lg:self-auto"
        >
          {creando ? <MdClose className="h-5 w-5" aria-hidden focusable="false" /> : <MdAdd className="h-5 w-5" aria-hidden focusable="false" />}
          {creando ? 'Cerrar' : 'Nuevo usuario'}
        </Button>
      </div>

      {creando ? (
        <div ref={panel} className="page-in">
          <Card className="px-5 py-6 sm:px-6">
            <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Nuevo usuario</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  Un administrador ve el panel de su parqueadero; un super administrador configura toda la plataforma.
                </p>
                <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  <MdPointOfSale className="mt-0.5 h-4 w-4 shrink-0" aria-hidden focusable="false" />
                  Los usuarios de kiosco se crean con su kiosco, en la ficha del parqueadero.
                </p>
              </div>
              <UserForm parkingLots={parkingLots} />
            </div>
          </Card>
        </div>
      ) : null}

      {porGrupo.length === 0 && huerfanos.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">Nadie coincide con la búsqueda</p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">Prueba con otra parte del nombre o del correo, o quita el filtro de rol.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              setBusqueda('');
              setFiltro('todos');
            }}
          >
            Ver a todos
          </Button>
        </Card>
      ) : (
        <>
          {porGrupo.map(({ group, members }) => (
            <Card key={group.id} className="overflow-hidden">
              <section aria-labelledby={`grupo-${group.id}`}>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-subtle)] px-5 py-4">
                  <div className="min-w-0">
                    <h2 id={`grupo-${group.id}`} className="flex items-baseline gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                      {group.title}
                      <span className="tnum text-[12px] font-medium text-[var(--text-muted)]">{members.length}</span>
                    </h2>
                    <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{group.subtitle}</p>
                  </div>
                  {group.href ? (
                    <Link
                      href={group.href}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--text-primary)] underline decoration-brand-500 decoration-2 underline-offset-4 transition-colors duration-150 hover:decoration-[var(--text-primary)]"
                    >
                      Ver parqueadero
                      <MdArrowForward className="h-3.5 w-3.5" aria-hidden focusable="false" />
                    </Link>
                  ) : null}
                </header>
                <ul className="divide-y divide-[var(--line-subtle)]">
                  {members.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      open={abierto === user.id}
                      onToggle={() => setAbierto((actual) => (actual === user.id ? null : user.id))}
                    />
                  ))}
                </ul>
              </section>
            </Card>
          ))}
          {huerfanos.length > 0 ? (
            <Card className="overflow-hidden">
              <header className="border-b border-[var(--line-subtle)] px-5 py-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Sin parqueadero</h2>
                <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">No pertenecen a ningún sitio activo.</p>
              </header>
              <ul className="divide-y divide-[var(--line-subtle)]">
                {huerfanos.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    open={abierto === user.id}
                    onToggle={() => setAbierto((actual) => (actual === user.id ? null : user.id))}
                  />
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function UserRow({ user, open, onToggle }: { user: DirectoryUser; open: boolean; onToggle: () => void }) {
  const fila = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (open && window.location.hash === `#usuario-${user.id}`) {
      fila.current?.scrollIntoView({ block: 'center' });
    }
  }, [open, user.id]);

  // "Kiosco principal" ya dice que es un kiosco: no se antepone otra vez.
  const rol =
    user.role === 'PUNTO_PAGO' && user.kioskName
      ? /^kiosco\b/i.test(user.kioskName.trim())
        ? user.kioskName
        : `Kiosco ${user.kioskName}`
      : ROL[user.role];

  return (
    <li ref={fila} id={`usuario-${user.id}`} className="scroll-mt-24 px-5 py-4">
      {/* En el celular el boton va debajo: al lado apretaba nombre y correo a cinco renglones. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        {user.role === 'PUNTO_PAGO' ? (
          <span
            aria-hidden
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              user.active ? 'bg-[var(--fill-soft-hover)] text-[var(--text-primary)]' : 'bg-[var(--fill-soft)] text-[var(--text-muted)]',
            )}
          >
            <MdPointOfSale className="h-5 w-5" />
          </span>
        ) : (
          <Avatar name={user.name} muted={!user.active} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            {user.name}
            {user.isSelf ? <Chip>Tu cuenta</Chip> : null}
            {!user.active ? <Chip muted>Inactivo</Chip> : null}
            {user.hasSession ? <Chip live>Sesión abierta</Chip> : null}
          </p>
          {/* El correo es con lo que entra la persona: se muestra entero, nunca recortado. */}
          <p className="break-all text-[13px] text-[var(--text-muted)]">{user.email}</p>
          <p className="text-[13px] text-[var(--text-muted)]">
            {rol}
            {' · '}
            <span className="tnum">
              {user.lastLoginAt ? `último ingreso ${formatDateTime(user.lastLoginAt)}` : 'nunca ha ingresado'}
            </span>
          </p>
        </div>
        </div>
        {user.isSelf ? (
          <Link
            href="/cuenta"
            className="inline-flex h-8 shrink-0 items-center self-start rounded-full sm:self-auto px-3 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)]"
          >
            Mi contraseña
          </Link>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`gestion-${user.id}`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-full px-3 text-[13px] font-medium ring-1 ring-inset transition-colors duration-150 sm:self-auto',
              open
                ? 'bg-[var(--fill-soft-hover)] text-[var(--text-primary)] ring-[var(--ring-strong)]'
                : 'text-[var(--text-secondary)] ring-[var(--ring-soft)] hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            Gestionar
            <MdExpandMore className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden focusable="false" />
          </button>
        )}
      </div>
      {open && !user.isSelf ? (
        <div id={`gestion-${user.id}`} className="page-in mt-4 rounded-xl bg-[var(--fill-soft)] p-4 ring-1 ring-inset ring-[var(--line-subtle)]">
          <UserActions
            userId={user.id}
            active={user.active}
            hasSession={user.hasSession}
            isSelf={false}
            allowLogout={user.role !== 'PUNTO_PAGO'}
          />
          {user.role === 'PUNTO_PAGO' ? (
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
              La sesión de un kiosco la cierra el administrador de su parqueadero, desde su panel: la pantalla está de cara al público.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Chip({ children, muted = false, live = false }: { children: React.ReactNode; muted?: boolean; live?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        muted
          ? 'bg-[var(--fill-soft-hover)] text-[var(--text-muted)] ring-[var(--ring-soft)]'
          : 'bg-[var(--fill-soft)] text-[var(--text-primary)] ring-[var(--ring-soft)]',
      )}
    >
      {live ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok-500" aria-hidden /> : null}
      {children}
    </span>
  );
}
