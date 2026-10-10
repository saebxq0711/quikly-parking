'use client';

import { useEffect } from 'react';

/**
 * Bloquea el zoom en las pantallas del kiosco: la interfaz queda siempre al 100 %.
 *
 * El kiosco es autoservicio en una pantalla tactil fija. Un pellizco, un doble
 * toque o un Ctrl + rueda de alguien que pasaba agrandaba la pantalla, sacaba los
 * botones del cuadro y nadie del parqueadero estaba ahi para devolverla.
 *
 * Cubre lo que una pagina puede cubrir:
 *  - pellizco y doble toque: `viewport` del layout del kiosco + `touch-action`;
 *  - Ctrl/Cmd + rueda y Ctrl/Cmd + "+", "-", "0": se cancelan aqui;
 *  - gestos de Safari (`gesturestart`): se cancelan aqui.
 *
 * Lo que NO puede cubrir una pagina: un zoom que el navegador ya tenga guardado
 * para este sitio, o el de los menus del propio navegador. Por eso el navegador
 * del kiosco va en modo kiosco (`--kiosk`) y con `--force-device-scale-factor=1`.
 */
export function NoZoom() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('sin-zoom');

    const alRodar = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    const alTeclear = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (['+', '-', '=', '_', '0'].includes(event.key) || ['NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(event.code)) {
        event.preventDefault();
      }
    };
    const alGesto = (event: Event) => event.preventDefault();
    // Dos dedos sobre la pantalla = pellizco: el kiosco no tiene nada que se use con dos dedos.
    const alTocar = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    window.addEventListener('wheel', alRodar, { passive: false });
    window.addEventListener('keydown', alTeclear);
    document.addEventListener('gesturestart', alGesto);
    document.addEventListener('gesturechange', alGesto);
    document.addEventListener('touchmove', alTocar, { passive: false });

    return () => {
      html.classList.remove('sin-zoom');
      window.removeEventListener('wheel', alRodar);
      window.removeEventListener('keydown', alTeclear);
      document.removeEventListener('gesturestart', alGesto);
      document.removeEventListener('gesturechange', alGesto);
      document.removeEventListener('touchmove', alTocar);
    };
  }, []);

  return null;
}
