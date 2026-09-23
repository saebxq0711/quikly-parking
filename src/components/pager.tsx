import Link from 'next/link';

/**
 * Paginacion.
 *
 * Una tabla que crece sin limite hacia abajo deja de ser consultable: el
 * operador no encuentra nada y la pagina tarda cada vez mas en cargar. Los
 * enlaces llevan la pagina en la direccion, asi que se puede compartir y
 * recargar sin perder el sitio.
 */
export function Pager({
  basePath,
  page,
  totalPages,
  query = {},
}: {
  basePath: string;
  page: number;
  totalPages: number;
  query?: Record<string, string | undefined>;
}) {
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value && key !== 'pagina') params.set(key, value);
    }
    params.set('pagina', String(target));
    return `${basePath}?${params.toString()}`;
  };

  const link =
    'inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft)] hover:ring-[var(--ring-strong)]';

  return (
    <nav
      aria-label="Paginacion"
      className="flex items-center justify-between border-t border-[var(--line-subtle)] px-5 py-3"
    >
      <span className="text-[13px] text-[var(--text-muted)]">
        Pagina {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={link}>
            Anterior
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={link}>
            Siguiente
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
