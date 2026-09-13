'use client';

import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@/components/ui';

/**
 * Filtros del historial.
 *
 * Los aplica Nova Parking, no nosotros: van tal cual a su listado de tiquetes,
 * que ya sabe filtrar por placa, estado y rango de fechas. Filtrar aqui seria
 * traer todo por el tunel para descartar la mayoria.
 *
 * Su busqueda por placa es "inteligente": si el texto es numerico busca por id
 * de tiquete y por los ultimos digitos de la placa; si trae letras, busca dentro
 * de la placa. Por eso el campo dice "placa o tiquete".
 */
export function HistoryFilters({
  basePath,
  current,
}: {
  basePath: string;
  current: {
    q?: string;
    estado?: string;
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
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
    >
      <div className="lg:col-span-2">
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Buscar
        </label>
        <Input
          name="q"
          defaultValue={current.q ?? ''}
          placeholder="Placa o codigo del tiquete"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Estado
        </label>
        <Select name="estado" defaultValue={current.estado ?? 'TODOS'}>
          <option value="TODOS">Todos</option>
          <option value="IN">Adentro</option>
          <option value="PAID">Pagado</option>
          <option value="OUT">Salio</option>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Desde
        </label>
        <Input type="date" name="desde" defaultValue={current.desde ?? ''} />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Hasta
        </label>
        <Input type="date" name="hasta" defaultValue={current.hasta ?? ''} />
      </div>

      <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
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
