'use client';

import { useEffect, useState } from 'react';
import { MdDarkMode, MdLightMode } from 'react-icons/md';
import { LLAVE_TEMA, temaPorHora, type Tema } from './theme-script';

/**
 * Dia y noche en el kiosco.
 *
 * El kiosco es un monitor de 27" a la entrada del parqueadero: de dia le da el
 * sol de frente y de noche es lo unico encendido alrededor. Son dos problemas
 * opuestos y un solo tema no resuelve los dos.
 *
 *   dia    fondo blanco y texto casi negro. Con sol, lo unico que se lee es el
 *          contraste maximo; subir el brillo de la pantalla no alcanza.
 *   noche  fondo violeta profundo. Una pantalla blanca de 27" en un parqueadero
 *          oscuro deslumbra y el cliente deja de ver hasta el teclado.
 *
 * Cambia solo por hora y se puede forzar a mano. El cambio manual dura solo
 * hasta el proximo amanecer o anochecer: si alguien pone el modo noche a
 * mediodia porque el kiosco quedo a la sombra, al dia siguiente la pantalla no
 * amanece oscura con el sol encima.
 */

function leerGuardado(auto: Tema): Tema {
  try {
    const crudo = localStorage.getItem(LLAVE_TEMA);
    if (!crudo) return auto;
    const guardado = JSON.parse(crudo) as { tema?: Tema; auto?: Tema };
    // El ajuste manual solo vale mientras no cambie el momento del dia.
    return guardado.auto === auto && guardado.tema ? guardado.tema : auto;
  } catch {
    return auto;
  }
}

function aplicar(tema: Tema) {
  document.documentElement.dataset.theme = tema;
}

/** Boton de sol/luna del encabezado del kiosco. */
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>('day');

  useEffect(() => {
    const sincronizar = () => {
      const auto = temaPorHora();
      const elegido = leerGuardado(auto);
      setTema(elegido);
      aplicar(elegido);
    };

    sincronizar();
    // El kiosco no se recarga en dias: sin este repaso, amaneceria en modo noche.
    const timer = setInterval(sincronizar, 5 * 60_000);
    return () => clearInterval(timer);
  }, []);

  function alternar() {
    const siguiente: Tema = tema === 'day' ? 'night' : 'day';
    setTema(siguiente);
    aplicar(siguiente);
    try {
      localStorage.setItem(
        LLAVE_TEMA,
        JSON.stringify({ tema: siguiente, auto: temaPorHora() }),
      );
    } catch {
      // Sin almacenamiento el cambio vale para esta sesion y no se guarda.
    }
  }

  const esDia = tema === 'day';

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={esDia ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
      title={esDia ? 'Modo noche' : 'Modo día'}
      className="flex h-[3.2rem] w-[3.2rem] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-card)] ring-1 ring-inset ring-[var(--line-subtle)] transition-colors duration-150 hover:bg-[var(--surface-raised-hover)] kland:h-11 kland:w-11"
    >
      {esDia ? (
        <MdDarkMode className="h-6 w-6" aria-hidden focusable="false" />
      ) : (
        <MdLightMode className="h-6 w-6 text-brand-500" aria-hidden focusable="false" />
      )}
    </button>
  );
}
