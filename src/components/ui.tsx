import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { PaymentStatus } from '@prisma/client';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'confirm';
type ButtonSize = 'sm' | 'md' | 'lg' | 'kiosk';

/**
 * Un solo vocabulario de boton en todo el producto. Si el boton de guardar se
 * ve distinto en dos pantallas, una de las dos esta mal.
 * Todas las variantes traen hover, active y disabled: no se envia media tabla
 * de estados.
 *
 * El lavanda de marca se usa en el paso 600/700 y no en el 400 del manual: el
 * tono puro es un color claro, y un boton solido necesita sostener texto blanco
 * encima. Las variantes suaves van por variables (`--fill-*`, `--ring-*`) para
 * que el mismo boton funcione sobre superficie profunda y sobre blanco.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-700 day:hover:bg-brand-700 disabled:bg-brand-600/30 disabled:text-white/40',
  confirm:
    'bg-ok-600 text-white hover:bg-ok-500 active:bg-ok-600 day:bg-ok-700 day:hover:bg-ok-600 disabled:bg-ok-600/30 disabled:text-white/40',
  secondary:
    'bg-[var(--fill-soft)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--ring-soft)] hover:bg-[var(--fill-soft-hover)] hover:ring-[var(--ring-strong)] active:bg-[var(--fill-strong)] disabled:text-[var(--text-muted)]',
  ghost:
    'text-[var(--text-secondary)] hover:bg-[var(--fill-soft)] hover:text-[var(--text-primary)] active:bg-[var(--fill-soft-hover)] disabled:text-[var(--text-muted)]',
  danger:
    'bg-bad-600 text-white hover:bg-bad-500 active:bg-bad-600 disabled:bg-bad-600/30 disabled:text-white/40',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  // 44px: minimo tactil comodo para una interfaz administrativa.
  md: 'h-11 px-4 text-sm rounded-lg gap-2',
  lg: 'h-13 px-6 text-[15px] rounded-xl gap-2',
  // El kiosco se opera de pie, a veces con guantes.
  kiosk: 'min-h-16 px-8 text-lg rounded-2xl gap-3 kshort:min-h-14',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold',
        'transition-[background-color,box-shadow,color] duration-150',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------- Superficie */

/**
 * Panel de contenido. Una sola profundidad: no se anidan paneles dentro de
 * paneles, porque el segundo nivel deja de leerse como jerarquia y pasa a ser
 * ruido.
 */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--line-subtle)]',
        'shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-[var(--line-subtle)] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Forms */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-bad-400">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] leading-relaxed text-[var(--text-muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const CONTROL = [
  'block w-full rounded-lg border-0 bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-primary)]',
  'ring-1 ring-inset ring-[var(--ring-soft)] placeholder:text-[var(--text-muted)]',
  'transition-shadow duration-150',
  'hover:ring-[var(--ring-strong)]',
  'focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:outline-none day:focus:ring-brand-700',
  'disabled:opacity-60 disabled:text-[var(--text-muted)]',
].join(' ');

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

/** Lista desplegable con diseno propio, no la del navegador (ver `select.tsx`). */
export { Select } from './select';

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-primary)]">
      <input
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded border-0 bg-[var(--surface-sunken)] text-brand-500',
          'ring-1 ring-inset ring-[var(--ring-strong)] focus:ring-2 focus:ring-brand-500',
          className,
        )}
        {...props}
      />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------- Alert */

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: 'bg-brand-500/10 text-brand-200 ring-brand-400/25 day:text-brand-800 day:ring-brand-600/30',
    success: 'bg-ok-500/10 text-ok-300 ring-ok-400/25 day:text-ok-700 day:ring-ok-600/35',
    warning: 'bg-warn-500/10 text-warn-300 ring-warn-400/25 day:text-warn-600 day:ring-warn-500/40',
    error: 'bg-bad-500/10 text-bad-300 ring-bad-400/25 day:text-bad-600 day:ring-bad-500/35',
  } as const;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-4 py-3 text-[13px] leading-relaxed ring-1 ring-inset',
        tones[tone],
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Estado */

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pendiente',
  INITIATED: 'En el datafono',
  IN_PROGRESS: 'Procesando',
  APPROVED: 'Aprobado',
  DECLINED: 'Rechazado',
  FAILED: 'Fallido',
  TIMEOUT: 'Expirado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Anulado',
};

const STATUS_STYLE: Record<PaymentStatus, string> = {
  PENDING: 'bg-white/[0.06] text-ink-300 ring-white/15',
  INITIATED: 'bg-brand-500/12 text-brand-200 ring-brand-400/30',
  IN_PROGRESS: 'bg-brand-500/12 text-brand-200 ring-brand-400/30',
  APPROVED: 'bg-ok-500/12 text-ok-300 ring-ok-400/30',
  DECLINED: 'bg-bad-500/12 text-bad-300 ring-bad-400/30',
  FAILED: 'bg-bad-500/12 text-bad-300 ring-bad-400/30',
  TIMEOUT: 'bg-warn-500/12 text-warn-300 ring-warn-400/30',
  CANCELLED: 'bg-white/[0.06] text-ink-400 ring-white/15',
  REFUNDED: 'bg-warn-500/12 text-warn-300 ring-warn-400/30',
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1',
        'text-[12px] font-medium ring-1 ring-inset',
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export { STATUS_LABEL };

/* ------------------------------------------------------------ Estado vacio */

/**
 * Un estado vacio ensena la interfaz. "No hay nada" no le dice al operador
 * que hacer a continuacion.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Format */

/** Moneda colombiana: sin decimales, con separador de miles. */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value: Date | string | null): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date);
}

/** Duracion legible a partir de minutos: "2 h 15 min". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return `${hours} h ${rest} min`;
}
