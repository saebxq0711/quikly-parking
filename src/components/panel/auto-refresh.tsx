'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Mantiene la pantalla al dia sin recargar: vuelve a pedir los datos cada 30 segundos y
 * al volver a la pestana. Mientras la pestana esta oculta no consulta nada, para no
 * cargar el tunel del parqueadero con pantallas que nadie esta mirando.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ultima, setUltima] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  const enCurso = useRef(false);

  useEffect(() => {
    enCurso.current = pending;
    if (!pending) setUltima(Date.now());
  }, [pending]);

  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState !== 'visible' || enCurso.current) return;
      startTransition(() => router.refresh());
    };
    const timer = setInterval(refrescar, seconds * 1000);
    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [router, seconds]);

  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 5_000);
    return () => clearInterval(reloj);
  }, []);

  const hace = Math.max(0, Math.round((ahora - ultima) / 1000));

  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full bg-white/[0.04] px-3 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-white/10">
      <span
        className={`live-dot h-2 w-2 rounded-full ${pending ? 'bg-brand-400' : 'bg-ok-400'}`}
        aria-hidden="true"
      />
      {pending ? 'Actualizando...' : hace < 10 ? 'En vivo' : `Actualizado hace ${hace} s`}
    </span>
  );
}
