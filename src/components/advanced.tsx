import { MdExpandMore } from 'react-icons/md';

/**
 * Bloque plegado para lo que casi nunca se toca (ambiente, identificadores tecnicos).
 *
 * Esta ahi para cuando hace falta, pero no ocupa la pantalla ni hace dudar a quien
 * solo viene a pegar las credenciales.
 */
export function Advanced({
  title = 'Opciones avanzadas',
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl bg-[var(--fill-soft)] ring-1 ring-inset ring-[var(--line-subtle)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
        {title}
        <MdExpandMore
          className="h-5 w-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
          focusable="false"
        />
      </summary>
      <div className="page-in space-y-4 border-t border-[var(--line-subtle)] px-4 py-4">{children}</div>
    </details>
  );
}
