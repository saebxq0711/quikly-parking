'use client';

import { useEffect, useState } from 'react';
import { MdCheck, MdPriorityHigh } from 'react-icons/md';
import { cn } from '@/components/ui';

export interface IndexEntry {
  id: string;
  /** Seccion a la que lleva; por defecto la del mismo id. Kioscos y Datafono comparten la suya. */
  target?: string;
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Indice de la ficha de un parqueadero: cada seccion con su estado, el mismo del
 * riel del directorio. Marca la seccion que se esta leyendo.
 *
 * En pantallas anchas va fijo a la izquierda; en el celular es una fila de
 * pildoras al principio (la cabecera negra del panel ya es pegajosa, y dos barras
 * pegadas se comerian media pantalla).
 */
export function SectionIndex({ entries }: { entries: IndexEntry[] }) {
  const destino = (entry: IndexEntry) => entry.target ?? entry.id;
  const [activa, setActiva] = useState(entries[0] ? destino(entries[0]) : '');

  useEffect(() => {
    const secciones = [...new Set(entries.map((entry) => entry.target ?? entry.id))]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (secciones.length === 0) return;

    // La seccion activa es la ultima cuyo borde superior ya paso el primer cuarto de la pantalla.
    const calcular = () => {
      const umbral = window.innerHeight * 0.25;
      let actual = secciones[0].id;
      for (const seccion of secciones) {
        if (seccion.getBoundingClientRect().top <= umbral) actual = seccion.id;
      }
      // Al llegar al final, la ultima seccion es la activa aunque sea corta.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        actual = secciones[secciones.length - 1].id;
      }
      setActiva(actual);
    };

    calcular();
    window.addEventListener('scroll', calcular, { passive: true });
    window.addEventListener('resize', calcular);
    return () => {
      window.removeEventListener('scroll', calcular);
      window.removeEventListener('resize', calcular);
    };
  }, [entries]);

  return (
    <nav aria-label="Secciones del parqueadero">
      {/* `relative`: los textos sr-only son absolutos, y sin un contenedor posicionado
          se escapaban de la franja desplazable y ensanchaban la pagina en el celular. */}
      <ul className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
        {entries.map((entry) => {
          const actual = destino(entry) === activa;
          return (
            <li key={entry.id} className="shrink-0">
              <a
                href={`#${destino(entry)}`}
                aria-current={actual ? 'location' : undefined}
                title={entry.detail}
                className={cn(
                  'flex items-center gap-2.5 rounded-full px-3 py-2 text-[13.5px] transition-colors duration-150 lg:rounded-xl',
                  actual
                    ? 'bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-card)] ring-1 ring-[var(--line-subtle)]'
                    : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-1 ring-[var(--line-subtle)] hover:text-[var(--text-primary)] lg:bg-transparent lg:ring-0 lg:hover:bg-[var(--fill-soft)]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    entry.ok ? 'bg-ok-50 text-ok-700 ring-1 ring-inset ring-ok-400/40' : 'bg-warn-500 text-white',
                  )}
                >
                  {entry.ok ? <MdCheck className="h-3 w-3" /> : <MdPriorityHigh className="h-3 w-3" />}
                </span>
                <span className="whitespace-nowrap">{entry.label}</span>
                <span className="sr-only">: {entry.detail}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
