'use client';

import { useEffect, useState } from 'react';

/**
 * El kiosco SIEMPRE en pantalla completa (2026-10-15).
 *
 * En la pantalla tactil del 122, un pellizco o un deslizamiento desde el borde hacia
 * el centro sacaba al navegador de pantalla completa: aparecian la barra de
 * direcciones, las pestanas y la barra de Windows, y cualquiera podia salir del
 * kiosco. Ese gesto lo atiende el navegador por encima de la pagina, asi que una
 * pagina no lo puede impedir siempre. Por eso hay dos capas:
 *
 *  1. Se cancelan todos los gestos que una pagina puede cancelar: dos o mas dedos
 *     (pellizco), el menu del toque largo y arrastrar elementos. El zoom y el
 *     desplazamiento elastico que navega atras/adelante los cubre `NoZoom`.
 *  2. Si aun asi el navegador sale de pantalla completa, una capa cubre el kiosco
 *     entero y el primer toque la vuelve a poner. El kiosco nunca queda usable fuera
 *     de pantalla completa. (Volver necesita un toque: un navegador no deja entrar en
 *     pantalla completa sin uno.)
 *
 * Lo que cierra del todo la puerta es la configuracion del equipo: navegador en modo
 * kiosco (`--kiosk`) y gestos de borde de Windows apagados.
 *
 * Fuera de produccion la capa no aparece, para poder probar en un computador.
 */
const SOLO_EN_PRODUCCION = process.env.NODE_ENV === 'production';

/** Margen para la diferencia de redondeo entre la ventana y la pantalla con escalado. */
const TOLERANCIA_PX = 3;

function enPantallaCompleta(): boolean {
  if (document.fullscreenElement) return true;
  // Un campo enfocado = teclado en pantalla abierto: la ventana se achica pero no salio.
  if (document.activeElement instanceof HTMLInputElement) return true;
  // F11 o modo kiosco del navegador: no hay `fullscreenElement`, pero la ventana
  // ocupa la pantalla entera.
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  return (
    window.innerHeight >= window.screen.height - TOLERANCIA_PX &&
    window.innerWidth >= window.screen.width - TOLERANCIA_PX
  );
}

function pedirPantallaCompleta() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    // Sin un toque de por medio el navegador lo rechaza: la capa espera el siguiente.
  });
}

export function FullscreenLock() {
  const [fuera, setFuera] = useState(false);

  useEffect(() => {
    // 1. Gestos que la pagina si puede cancelar.
    const variosDedos = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const cancelar = (event: Event) => event.preventDefault();
    const opciones = { passive: false, capture: true } as const;
    document.addEventListener('touchstart', variosDedos, opciones);
    document.addEventListener('touchmove', variosDedos, opciones);
    document.addEventListener('contextmenu', cancelar, { capture: true });
    document.addEventListener('dragstart', cancelar, { capture: true });

    // 2. Vigilar la pantalla completa y volver a ella con el primer toque. Solo en
    //    produccion: en un computador de pruebas cada toque pondria pantalla completa.
    if (!SOLO_EN_PRODUCCION) {
      return () => {
        document.removeEventListener('touchstart', variosDedos, opciones);
        document.removeEventListener('touchmove', variosDedos, opciones);
        document.removeEventListener('contextmenu', cancelar, { capture: true });
        document.removeEventListener('dragstart', cancelar, { capture: true });
      };
    }
    const revisar = () => setFuera(!enPantallaCompleta());
    /*
      Con cada toque, si la PAGINA no esta en pantalla completa, se pide. Aunque el
      navegador ya este en F11: asi, desde el primer toque, el estado no depende del
      tamano de la ventana (el teclado en pantalla de Windows la achica al escribir los
      datos de la factura, y eso no es salir de pantalla completa).
    */
    const alTocar = () => {
      if (!document.fullscreenElement) pedirPantallaCompleta();
    };
    revisar();
    document.addEventListener('fullscreenchange', revisar);
    window.addEventListener('resize', revisar);
    // `pointerup`/`touchend`/`click` cuentan como gesto del usuario para el navegador.
    window.addEventListener('pointerup', alTocar, { capture: true });
    window.addEventListener('touchend', alTocar, { capture: true });
    window.addEventListener('click', alTocar, { capture: true });

    return () => {
      document.removeEventListener('touchstart', variosDedos, opciones);
      document.removeEventListener('touchmove', variosDedos, opciones);
      document.removeEventListener('contextmenu', cancelar, { capture: true });
      document.removeEventListener('dragstart', cancelar, { capture: true });
      document.removeEventListener('fullscreenchange', revisar);
      window.removeEventListener('resize', revisar);
      window.removeEventListener('pointerup', alTocar, { capture: true });
      window.removeEventListener('touchend', alTocar, { capture: true });
      window.removeEventListener('click', alTocar, { capture: true });
    };
  }, []);

  if (!fuera || !SOLO_EN_PRODUCCION) return null;

  return (
    <button
      type="button"
      onClick={pedirPantallaCompleta}
      className="touch-surface fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 bg-[var(--surface-base)] px-10 text-center"
    >
      <span className="text-[2.6rem] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
        Toca la pantalla para continuar
      </span>
      <span className="max-w-[34rem] text-xl text-[var(--text-secondary)]">
        El punto de pago vuelve a pantalla completa. Si tienes un pago en curso, sigue igual.
      </span>
    </button>
  );
}
