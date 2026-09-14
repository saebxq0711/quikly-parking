'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Barra fina arriba mientras carga la siguiente pantalla.
 *
 * El App Router no avisa cuando empieza una navegacion, asi que se enciende al tocar
 * un enlace interno (o al enviar un filtro) y se apaga cuando cambia la direccion.
 * Sin esto, las paginas que consultan el parqueadero por el tunel tardan un par de
 * segundos y parecia que el clic no habia hecho nada.
 */
function Barra() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activa, setActiva] = useState(false);

  useEffect(() => {
    setActiva(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!activa) return;
    // Por si la navegacion se cancela: no queda encendida para siempre.
    const respaldo = setTimeout(() => setActiva(false), 15_000);
    return () => clearTimeout(respaldo);
  }, [activa]);

  useEffect(() => {
    const alClic = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const enlace = (event.target as Element | null)?.closest?.('a');
      if (!enlace || enlace.target === '_blank' || enlace.hasAttribute('download')) return;

      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname.startsWith('/api/')) return;
      if (
        destino.pathname === window.location.pathname &&
        destino.search === window.location.search
      ) {
        return;
      }
      setActiva(true);
    };

    const alEnviar = (event: SubmitEvent) => {
      const formulario = event.target as HTMLFormElement | null;
      // Solo los filtros (GET) navegan; las acciones de servidor van por POST.
      if (formulario && (formulario.getAttribute('method') ?? 'get').toLowerCase() === 'get') {
        setActiva(true);
      }
    };

    document.addEventListener('click', alClic, true);
    document.addEventListener('submit', alEnviar, true);
    return () => {
      document.removeEventListener('click', alClic, true);
      document.removeEventListener('submit', alEnviar, true);
    };
  }, []);

  return <div aria-hidden="true" className={`nav-progress ${activa ? 'nav-progress-on' : ''}`} />;
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
