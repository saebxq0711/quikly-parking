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
      {/*
        La barra es NEGRA y el area de trabajo clara: la navegacion se lee como el
        marco del producto y no compite con los datos. En negro, el logo va en su
        version negativa (texto blanco, trazo amarillo), que es la que el manual de
        marca pide sobre fondo oscuro, y la seccion activa es el unico amarillo.
      */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[var(--surface-chrome)] text-[var(--text-on-chrome)] lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="px-6 pb-5 pt-7">
          <Image
            src="/quikly-parking.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="h-10 w-auto"
          />
          <div className="mt-6 rounded-xl bg-white/[0.06] px-3.5 py-3">
            <p className="truncate text-[13px] font-semibold text-white">{contextName}</p>
            {contextHint ? (
              <p className="truncate text-xs text-[var(--text-on-chrome-muted)]">{contextHint}</p>
            ) : null}
          </div>
        </div>

        <SideNav items={navItems} />

        <div className="border-t border-white/10 p-3">
          <p className="truncate px-3 pt-1 text-[13px] font-semibold text-white">{userName}</p>
          <p className="px-3 pb-2 text-xs text-[var(--text-on-chrome-muted)]">
            {ROLE_LABEL[role]}
          </p>
          <Link
            href="/cuenta"
            className="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-on-chrome-muted)] transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <MdLockOutline className="h-4.5 w-4.5 shrink-0" aria-hidden focusable="false" />
            Cambiar contraseña
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Bajo lg, dos filas sobre negro: arriba la marca y la cuenta (contraseña y
          salir, con su nombre), abajo la navegación entera con desplazamiento
          lateral. Antes iba todo en una fila y las secciones salían cortadas.
        */}
        <header className="sticky top-0 z-10 bg-[var(--surface-chrome)] text-white lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <Image
              src="/quikly-parking.png"
              alt="Quikly Parking"
              width={783}
              height={269}
              className="h-7 w-auto shrink-0"
            />
            <div className="flex items-center gap-1">
              <Link
                href="/cuenta"
                aria-label="Cambiar contraseña"
                title="Cambiar contraseña"
                className="shrink-0 rounded-full p-2 text-[var(--text-on-chrome-muted)] transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                <MdLockOutline className="h-5 w-5" aria-hidden focusable="false" />
              </Link>
              <LogoutButton compact />
            </div>
          </div>
          <div className="px-3 pb-3 pt-2.5">
            <SideNav items={navItems} compact />
          </div>
        </header>

        <main className="min-w-0 flex-1 bg-[var(--surface-page)] p-4 sm:p-6 lg:p-10">{children}</main>
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
    <div className="mb-8">
      {back ? <div className="mb-3">{back}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
