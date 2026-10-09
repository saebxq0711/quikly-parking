import { MdCloudOff, MdInfoOutline } from 'react-icons/md';
import type { PanelResult } from '@/integrations/nova-parking/panel';

/**
 * Piezas del panel del administrador.
 *
 * Todo lo que se pinta aqui es de solo lectura: el panel consulta el sistema del
 * parqueadero y no puede modificar nada en el.
 */

/** Cifra grande de cabecera. */
export function Stat({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'plain' | 'accent';
}) {
  return (
    /*
      La cifra principal de cada pantalla va sobre el amarillo palido de la marca
      (el mismo del "Total a pagar" del kiosco); las demas, sobre blanco. Una sola
      por pantalla: si todas fueran amarillas, ninguna seria la principal.
    */
    <div
      className={`rounded-2xl p-5 ring-1 ${
        tone === 'accent'
          ? 'bg-[var(--accent-soft)] ring-[var(--accent-soft-line)]'
          : 'bg-[var(--surface-raised)] ring-[var(--line-subtle)]'
      }`}
    >
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="tnum mt-1.5 text-[2rem] font-bold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Lo que se muestra cuando una consulta al sistema del parqueadero no responde.
 *
 * Nunca una tabla vacia: se leeria como "tu parqueadero no tuvo movimiento", y
 * seria mentira. El mensaje es para el administrador del parqueadero, sin detalles
 * tecnicos; el motivo exacto queda en el registro del servidor.
 */
export function SourceNotice({
  result,
  what,
}: {
  result: Extract<PanelResult<unknown>, { ok: false }>;
  what: string;
}) {
  const pending = result.reason === 'not-exposed';
  const Glyph = pending ? MdInfoOutline : MdCloudOff;

  return (
    <div
      className={`flex gap-3 rounded-2xl p-5 ring-1 ${
        pending
          ? 'bg-[var(--fill-soft)] ring-[var(--line-subtle)]'
          : 'bg-warn-100/50 ring-warn-400/25'
      }`}
    >
      <Glyph
        className={`mt-0.5 h-5 w-5 shrink-0 ${
          pending ? 'text-[var(--text-muted)]' : 'text-warn-600'
        }`}
        aria-hidden
        focusable="false"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {pending ? `${what}: no disponible por ahora` : `${what}: sin conexión con el parqueadero`}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {pending
            ? 'Esta información todavía no está habilitada para tu parqueadero.'
            : 'No pudimos consultar el sistema del parqueadero. Intenta de nuevo en unos minutos.'}
        </p>
      </div>
    </div>
  );
}

/** Cabecera de tabla, para que todas las del panel se vean iguales. */
export function Th({
  children,
  align = 'left',
  first = false,
  last = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  first?: boolean;
  last?: boolean;
}) {
  return (
    <th
      className={`py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${
        first ? 'pl-5 pr-4' : last ? 'pr-5 pl-4' : 'px-4'
      }`}
    >
      {children}
    </th>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--line-subtle)] text-[13px] text-[var(--text-secondary)]">
        {children}
      </tr>
    </thead>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="divide-y divide-[var(--line-subtle)]">{children}</tbody>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <tr className="transition-colors duration-100 hover:bg-[var(--fill-soft)]">
      {children}
    </tr>
  );
}

/** Titulo de una tarjeta con tabla. */
export function CardTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-subtle)] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Fecha que llega de Nova Parking como `31/08/26 07:15:49` o como ISO. */
export function formatUpstreamDate(value: string | null): string {
  if (!value) return '—';

  const local = value.match(
    /^(\d{2})\/(\d{2})\/(\d{2,4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (local) {
    const [, day, month, year, hour, minute] = local;
    return `${day}/${month}/${year.slice(-2)} ${hour}:${minute}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).format(parsed);
}

const TICKET_STATUS: Record<string, { label: string; className: string }> = {
  IN: { label: 'Adentro', className: 'bg-brand-100 text-ink-950 ring-brand-300' },
  PAID: { label: 'Pagado', className: 'bg-ok-50 text-ok-700 ring-ok-400/25' },
  OUT: { label: 'Salio', className: 'bg-[var(--fill-soft-hover)] text-[var(--text-primary)] ring-[var(--line-subtle)]' },
};

export function TicketStatus({
  status,
  cancelled,
}: {
  status: string | null;
  cancelled?: boolean;
}) {
  if (cancelled) {
    return (
      <span className="inline-flex rounded-full bg-bad-50 px-2.5 py-1 text-[11px] font-medium text-bad-700 ring-1 ring-bad-400/25">
        Anulado
      </span>
    );
  }
  const known = status ? TICKET_STATUS[status] : undefined;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
        known?.className ??
        'bg-[var(--fill-soft-hover)] text-[var(--text-secondary)] ring-[var(--line-subtle)]'
      }`}
    >
      {known?.label ?? status ?? '—'}
    </span>
  );
}
