import Link from 'next/link';
import { MdCheck, MdPriorityHigh } from 'react-icons/md';
import { cn } from '@/components/ui';
import type { ReadinessItem } from '@/lib/parking/readiness';

/**
 * Piezas del directorio de parqueaderos del SuperAdmin.
 *
 * El estado de preparacion habla con dos tonos: verde resultado cuando el punto
 * esta listo y naranja advertencia cuando falta. Nunca amarillo: el amarillo es
 * la accion principal de la pantalla, y un punto pendiente en amarillo parece un
 * boton (DESIGN.md, The Resultado Rule y The Siguiente Paso Rule).
 */

/** Los seis puntos de preparacion de un sitio, cada uno enlazado a su seccion. */
export function ReadinessRail({
  items,
  slug,
  className,
}: {
  items: ReadinessItem[];
  slug: string;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap gap-2', className)} aria-label="Preparación del parqueadero">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={`/admin/parqueaderos/${slug}#${item.anchor}`}
            title={item.detail}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[12.5px] font-medium ring-1 ring-inset transition-colors duration-150',
              item.ok
                ? 'bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-[var(--line-subtle)] hover:ring-[var(--ring-strong)] hover:text-[var(--text-primary)]'
                : 'bg-warn-100/60 text-warn-700 ring-warn-400/40 hover:bg-warn-100',
            )}
          >
            <StateDot ok={item.ok} />
            {item.label}
            <span className="sr-only">: {item.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Circulo de estado: chulito verde o admiracion naranja. */
export function StateDot({ ok, size = 'sm' }: { ok: boolean; size?: 'sm' | 'md' }) {
  const caja = size === 'md' ? 'h-6 w-6' : 'h-5 w-5';
  const icono = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        caja,
        ok ? 'bg-ok-50 text-ok-700 ring-1 ring-inset ring-ok-400/40' : 'bg-warn-500 text-white',
      )}
    >
      {ok ? <MdCheck className={icono} /> : <MdPriorityHigh className={icono} />}
    </span>
  );
}

/** Estado del sitio entero, para la cabecera de su bloque y de su ficha. */
export function LotStatus({ pending, active }: { pending: number; active: boolean }) {
  if (!active) {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--fill-soft-hover)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-muted)] ring-1 ring-inset ring-[var(--ring-soft)]">
        Inactivo
      </span>
    );
  }
  return pending === 0 ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-50 px-2.5 py-1 text-[12px] font-medium text-ok-700 ring-1 ring-inset ring-ok-400/40">
      <MdCheck className="h-3.5 w-3.5" aria-hidden focusable="false" />
      Listo para operar
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-100/60 px-2.5 py-1 text-[12px] font-medium text-warn-700 ring-1 ring-inset ring-warn-400/40">
      <MdPriorityHigh className="h-3.5 w-3.5" aria-hidden focusable="false" />
      {pending === 1 ? 'Falta 1 punto' : `Faltan ${pending} puntos`}
    </span>
  );
}

/** Iniciales de una persona. Sin fotos: no las tenemos y no se inventan. */
export function Avatar({ name, muted = false, size = 'md' }: { name: string; muted?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide',
        size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-[13px]',
        muted
          ? 'bg-[var(--fill-soft)] text-[var(--text-muted)]'
          : 'bg-[var(--fill-soft-hover)] text-[var(--text-primary)]',
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Iniciales para el circulo de una persona: dos letras, nunca vacio. */
function initials(name: string): string {
  // Solo palabras que empiezan por letra: "Administrador Parqueadero 122" da "AP", no "A1".
  const partes = name.trim().split(/\s+/).filter((parte) => /^\p{L}/u.test(parte));
  const letras = (partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes)
    .map((parte) => parte[0])
    .join('');
  return (letras || '?').toUpperCase().slice(0, 2);
}
