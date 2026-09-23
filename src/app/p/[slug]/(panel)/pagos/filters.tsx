'use client';

import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { STATUS_LABEL } from '@/components/ui';

/**
 * Filtros del historial de pagos.
 *
 * Se envian por querystring y los aplica el servidor. Asi los filtros quedan en
 * la URL (se pueden compartir y recargar) y el filtrado real ocurre en la base
 * de datos, no en el navegador.
 */
export function PaymentFilters({
  basePath,
  current,
}: {
  basePath: string;
  current: {
    q?: string;
    estado?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
  };
}) {
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();

    for (const [key, value] of data.entries()) {
      const text = String(value).trim();
      if (text && text !== 'TODOS') query.set(key, text);
    }

    router.push(query.toString() ? `${basePath}?${query}` : basePath);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
    >
      <div className="lg:col-span-2">
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Buscar
        </label>
        <Input
          name="q"
          defaultValue={current.q ?? ''}
          placeholder="Placa, tiquete o autorizacion"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Estado
        </label>
        <Select name="estado" defaultValue={current.estado ?? 'TODOS'}>
          <option value="TODOS">Todos</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Vehiculo
        </label>
        <Select name="tipo" defaultValue={current.tipo ?? 'TODOS'}>
          <option value="TODOS">Todos</option>
          <option value="CAR">Carro</option>
          <option value="MOTORCYCLE">Moto</option>
          <option value="BICYCLE">Bicicleta</option>
          <option value="SCOOTER">Patineta</option>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Desde
        </label>
        <DateField name="desde" defaultValue={current.desde ?? ''} label="Desde" />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Hasta
        </label>
        <DateField name="hasta" defaultValue={current.hasta ?? ''} label="Hasta" />
      </div>

      <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
        <Button type="submit">Aplicar filtros</Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(basePath)}
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
