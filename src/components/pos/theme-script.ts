/**
 * Arranque del tema del kiosco (ver `theme.tsx` para el porque de dia y noche).
 *
 * Vive en su propio archivo, sin `'use client'`, porque lo necesitan los dos
 * lados: la pagina del kiosco —que es de servidor— lo escribe en el HTML, y el
 * boton de sol/luna reusa las mismas horas para no calcular el amanecer de dos
 * maneras distintas.
 */

export type Tema = 'day' | 'night';

export const LLAVE_TEMA = 'quikly-tema-kiosco';
export const AMANECE = 6;
export const ANOCHECE = 18;

export function temaPorHora(fecha = new Date()): Tema {
  const hora = fecha.getHours();
  return hora >= AMANECE && hora < ANOCHECE ? 'day' : 'night';
}

/**
 * Se ejecuta antes de pintar, al principio de la pagina del kiosco.
 *
 * Sin esto la pantalla arranca en el tema por defecto y salta al otro cuando
 * React monta: de noche, eso es un fogonazo blanco a pantalla completa en la
 * cara del cliente.
 */
export const SCRIPT_TEMA_KIOSCO = `
(function () {
  try {
    var h = new Date().getHours();
    var auto = h >= ${AMANECE} && h < ${ANOCHECE} ? 'day' : 'night';
    var tema = auto;
    try {
      var guardado = JSON.parse(localStorage.getItem(${JSON.stringify(LLAVE_TEMA)}) || 'null');
      if (guardado && guardado.auto === auto) tema = guardado.tema;
    } catch (e) {}
    document.documentElement.dataset.theme = tema;
  } catch (e) {
    document.documentElement.dataset.theme = 'day';
  }
})();
`;
