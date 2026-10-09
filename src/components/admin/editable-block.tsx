'use client';

import { useState } from 'react';
import { MdEdit } from 'react-icons/md';
import { Button, cn } from '@/components/ui';

export interface SummaryItem {
  label: string;
  value: React.ReactNode;
  /** Numeros, codigos y fechas: cifras tabulares (DESIGN.md, The Letrero Rule). */
  tabular?: boolean;
  /** Falta: se pinta en naranja advertencia. */
  missing?: boolean;
}

/**
 * Una seccion de la ficha que ya esta lista se LEE: sus datos clave y un "Editar"
 * que abre el formulario en el mismo lugar. Una seccion pendiente llega abierta,
 * porque ahi lo que hay que hacer es completarla.
 *
 * Sin esto la ficha era un muro de formularios: todo editable a la vez, y para
 * saber que tenia un sitio habia que leer los campos uno por uno.
 */
export function EditableBlock({
  summary,
  defaultOpen,
  children,
  aside,
}: {
  summary: SummaryItem[];
  defaultOpen: boolean;
  children: React.ReactNode;
  /** Algo que vale tanto leyendo como editando (por ejemplo, "Probar conexión"). */
  aside?: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(defaultOpen);

  if (!abierto) {
    return (
      <div className="space-y-5">
        <SummaryList items={summary} />
        <div className="flex flex-wrap items-start gap-3">
          <Button type="button" variant="secondary" size="sm" className="px-4" onClick={() => setAbierto(true)}>
            <MdEdit className="h-4 w-4" aria-hidden focusable="false" />
            Editar
          </Button>
          {aside}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {aside}
      {children}
      {!defaultOpen ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Cerrar sin guardar
        </Button>
      ) : null}
    </div>
  );
}

export function SummaryList({ items }: { items: SummaryItem[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[13px] text-[var(--text-muted)]">{item.label}</dt>
          <dd
            className={cn(
              'mt-0.5 break-words text-sm font-medium',
              item.missing ? 'text-warn-700' : 'text-[var(--text-primary)]',
              item.tabular && 'tnum',
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
