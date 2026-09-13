'use client';

import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@/components/ui';

/**
 * Selector de reporte y periodo.
 *
 * Cada reporte de Nova Parking espera parametros distintos (el diario una fecha,
 * el mensual un mes, los otros un rango), asi que el campo "hasta" solo tiene
 * sentido en dos de los cuatro. En vez de mostrarlo siempre y que a veces no
 * haga nada, se oculta cuando no aplica.
 */

const OPTIONS = [
  { value: 'daily', label: 'Diario' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'consolidated', label: 'Consolidado' },
  { value: 'detailed-transactions', label: 'Transacciones detalladas' },
] as const;

export function ReportFilters({
  basePath,
  current,
}: {
  basePath: string;
  current: { tipo: string; desde: string; hasta: string };
}) {
  const router = useRouter();
  const usaRango =
    current.tipo === 'consolidated' || current.tipo === 'detailed-transactions';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const text = String(value).trim();
      if (text) query.set(key, text);
    }
    router.push(`${basePath}?${query}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
    >
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Reporte
        </label>
        {/* Cambiar el tipo recarga sola: el formulario de abajo depende de cual sea. */}
        <Select
          name="tipo"
          defaultValue={current.tipo}
          onChange={(event) =>
            router.push(
              `${basePath}?tipo=${event.currentTarget.value}&desde=${current.desde}&hasta=${current.hasta}`,
            )
          }
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {current.tipo === 'monthly' ? 'Mes' : 'Desde'}
        </label>
        <Input type="date" name="desde" defaultValue={current.desde} />
      </div>

      {usaRango ? (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Hasta
          </label>
          <Input type="date" name="hasta" defaultValue={current.hasta} />
        </div>
      ) : (
        <input type="hidden" name="hasta" value={current.hasta} readOnly />
      )}

      <div>
        <Button type="submit">Consultar</Button>
      </div>
    </form>
  );
}
