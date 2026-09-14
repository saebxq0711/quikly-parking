'use client';

import { useEffect, useState } from 'react';
import { permanencia } from '@/lib/printing/receipt-data';

/**
 * Tiempo que lleva un vehiculo adentro, corriendo en pantalla.
 *
 * Se calcula en el navegador desde la hora de entrada: entre una actualizacion de datos
 * y la siguiente el contador no se queda congelado. En el servidor no se pinta la cifra
 * (seria distinta a la del navegador un instante despues).
 */
export function LiveDuration({ since }: { since: string | null }) {
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);

  if (!since) return <span className="text-[var(--text-muted)]">—</span>;
  const inicio = Date.parse(since);
  if (Number.isNaN(inicio) || ahora === null) {
    return <span className="text-[var(--text-muted)]">...</span>;
  }
  return <span className="tnum">{permanencia(Math.max(0, (ahora - inicio) / 60_000))}</span>;
}
