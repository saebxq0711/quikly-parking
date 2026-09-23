'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { DateField } from '@/components/date-field';

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
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const desde = String(data.get('desde') ?? '');
    const hasta = String(data.get('hasta') ?? '');

    /*
      Las dos fechas son obligatorias, pero el aviso lo da el formulario y no el
      navegador: el calendario guarda su valor en un campo oculto, y un campo
      obligatorio que no se puede enfocar hace que Chrome cancele el envio en
      silencio.
    */
    if (!desde || !hasta) {
      setError('Elige la fecha inicial y la final.');
      return;
    }
    if (desde > hasta) {
      setError('La fecha inicial debe ser anterior a la final.');
      return;
    }

    setError(null);
    router.push(`${basePath}?${new URLSearchParams({ desde, hasta })}`);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Desde
        </label>
        <DateField name="desde" defaultValue={current.desde} max={hoy} required label="Desde" />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Hasta
        </label>
        <DateField name="hasta" defaultValue={current.hasta} max={hoy} required label="Hasta" />
      </div>
      <Button type="submit">Consultar</Button>
      {error ? (
        <p role="alert" className="text-[13px] text-bad-400 sm:col-span-3">
          {error}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)] sm:col-span-3">
          Maximo {maxDias} dias por consulta.
        </p>
      )}
    </form>
  );
}
