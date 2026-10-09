'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { IconType } from 'react-icons';
import {
  MdAccountBalanceWallet,
  MdAssessment,
  MdCreditCard,
  MdDirectionsCar,
  MdFactCheck,
  MdGroup,
  MdHistory,
  MdLocalParking,
  MdPointOfSale,
  MdShield,
  MdSettingsInputComponent,
  MdSpaceDashboard,
} from 'react-icons/md';

/**
 * Navegacion lateral con estado activo real.
 *
 * Sin el indicador de seccion actual, en un panel con varias areas el usuario
 * pierde el sitio en cuanto navega dos veces. La seccion activa es una pastilla
 * amarilla con texto negro sobre la barra negra: el unico amarillo de la barra,
 * asi que el ojo la encuentra sin leer.
 */

export type NavIcon =
  | 'lots'
  | 'users'
  | 'plug'
  | 'payments'
  | 'audit'
  | 'pos'
  | 'dashboard'
  | 'inside'
  | 'history'
  | 'cash'
  | 'reports'
  | 'security';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Marca activo tambien las subrutas (por ejemplo el detalle de un sitio). */
  matchPrefix?: boolean;
}

/**
 * Material Symbols via `react-icons`, no trazos propios: es el mismo juego que
 * usa el kiosco, asi que toda la plataforma comparte peso optico.
 */
const ICONS: Record<NavIcon, IconType> = {
  lots: MdLocalParking,
  users: MdGroup,
  plug: MdSettingsInputComponent,
  payments: MdCreditCard,
  audit: MdFactCheck,
  pos: MdPointOfSale,
  dashboard: MdSpaceDashboard,
  inside: MdDirectionsCar,
  history: MdHistory,
  cash: MdAccountBalanceWallet,
  reports: MdAssessment,
  security: MdShield,
};

function Icon({ name }: { name: NavIcon }) {
  const Glyph = ICONS[name];
  return <Glyph className="h-4.5 w-4.5 shrink-0" aria-hidden focusable="false" />;
}

export function SideNav({
  items,
  compact = false,
}: {
  items: NavItem[];
  compact?: boolean;
}) {
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    item.matchPrefix
      ? pathname === item.href || pathname.startsWith(`${item.href}/`)
      : pathname === item.href;

  if (compact) {
    return (
      <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              isActive(item)
                ? 'bg-brand-500 text-ink-950'
                : 'text-[var(--text-on-chrome-muted)] hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item) ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors duration-150 ${
            isActive(item)
              ? 'bg-brand-500 text-ink-950'
              : 'text-[var(--text-on-chrome-muted)] hover:bg-white/10 hover:text-white'
          }`}
        >
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
