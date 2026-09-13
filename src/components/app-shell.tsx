import Image from 'next/image';
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
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--line-subtle)] bg-[var(--surface-chrome)] lg:flex">
        <div className="border-b border-[var(--line-subtle)] px-5 py-5">
          {/*
            El logo de Nova Parking, no una marca propia: el administrador entra
            a ver su parqueadero, y para el es el mismo producto que ya conoce.
            El PNG lleva el texto en blanco, asi que solo funciona sobre superficie
            oscura — que es la unica que tiene esta aplicacion.
          */}
          <Image
            src="/nova-parking-horizontal.png"
            alt="Nova Parking"
            width={1433}
            height={360}
            priority
            className="h-7 w-auto"
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
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navegacion compacta bajo lg: el mismo destino, sin barra lateral. */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-chrome)]/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Image
            src="/nova-parking-horizontal.png"
            alt="Nova Parking"
            width={1433}
            height={360}
            className="hidden h-5 w-auto shrink-0 sm:block"
          />
          <SideNav items={navItems} compact />
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
