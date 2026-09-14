import Image from 'next/image';
import Link from 'next/link';
import { MdLockOutline } from 'react-icons/md';
import { SideNav, type NavItem } from './side-nav';
import { LogoutButton } from './logout-button';

export type { NavItem };

const ROLE_LABEL = {
  SUPERADMIN: 'Super administrador',
  ADMIN_PARQUEADERO: 'Administrador',
  PUNTO_PAGO: 'Punto de pago',
} as const;

/**
 * Chasis de las areas administrativas.
 *
 * Misma superficie y mismo acento que el punto de pago; lo que cambia es la
 * densidad. La barra lateral usa una capa neutra distinta de la del contenido
 * para que se lea como navegacion y no compita con los datos.
 */
export function AppShell({
  navItems,
  userName,
  role,
  contextName,
  contextHint,
  children,
}: {
  navItems: NavItem[];
  userName: string;
  role: keyof typeof ROLE_LABEL;
  contextName: string;
  contextHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      {/*
        Fija a la altura de la pantalla: el contenido se desplaza y la barra no, asi
        "Cambiar contrasena" y "Cerrar sesion" quedan siempre a la vista.
      */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--line-subtle)] bg-[var(--surface-chrome)] lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="border-b border-[var(--line-subtle)] px-5 py-5">
          {/*
            El logo de Nova Parking, no una marca propia: el administrador entra
            a ver su parqueadero, y para el es el mismo producto que ya conoce.
            El PNG lleva el texto en blanco, asi que solo funciona sobre superficie
            oscura — que es la unica que tiene esta aplicacion.
          */}
          <Image
            src="/quikly-parking.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="h-9 w-auto"
          />
          <p className="mt-4 truncate text-[13px] font-medium text-ink-200">
            {contextName}
          </p>
          {contextHint ? (
            <p className="truncate text-xs text-[var(--text-muted)]">
              {contextHint}
            </p>
          ) : null}
        </div>

        <SideNav items={navItems} />

        <div className="border-t border-[var(--line-subtle)] p-3">
          <p className="truncate px-3 text-[13px] font-medium text-ink-200">
            {userName}
          </p>
          <p className="px-3 pb-2 text-xs text-[var(--text-muted)]">
            {ROLE_LABEL[role]}
          </p>
          <Link
            href="/cuenta"
            className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100"
          >
            <MdLockOutline className="h-4.5 w-4.5 shrink-0" aria-hidden focusable="false" />
            Cambiar contrasena
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navegacion compacta bajo lg: el mismo destino, sin barra lateral. */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-chrome)]/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Image
            src="/quikly-parking.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            className="hidden h-7 w-auto shrink-0 sm:block"
          />
          <SideNav items={navItems} compact />
          <Link
            href="/cuenta"
            aria-label="Cambiar contrasena"
            title="Cambiar contrasena"
            className="shrink-0 rounded-lg p-2 text-[var(--text-secondary)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100"
          >
            <MdLockOutline className="h-4.5 w-4.5" aria-hidden focusable="false" />
          </Link>
          <LogoutButton compact />
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {back ? <div className="mb-3">{back}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
