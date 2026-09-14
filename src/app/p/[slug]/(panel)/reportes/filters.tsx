'use client';

import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';

/** Periodo del reporte. El maximo de dias lo vuelve a validar el servidor. */
export function ReportFilters({
  basePath,
  current,
  hoy,
  maxDias,
}: {
  basePath: string;
  current: { desde: string; hasta: string };
  hoy: string;
  maxDias: number;
}) {
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams({
      desde: String(data.get('desde') ?? ''),
      hasta: String(data.get('hasta') ?? ''),
    });
    router.push(`${basePath}?${query}`);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Desde
        </label>
        <Input type="date" name="desde" defaultValue={current.desde} max={hoy} required />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Hasta
        </label>
        <Input type="date" name="hasta" defaultValue={current.hasta} max={hoy} required />
      </div>
      <Button type="submit">Consultar</Button>
      <p className="text-xs text-[var(--text-muted)] sm:col-span-3">
        Maximo {maxDias} dias por consulta.
      </p>
    </form>
  );
}
