'use client';

/**
 * Teclado en pantalla para el punto de pago.
 *
 * Los kioscos tactiles no siempre tienen teclado fisico, y el del sistema
 * operativo tapa media pantalla y descoloca la composicion. Este siempre esta
 * visible y sus teclas cumplen el tamano tactil comodo.
 *
 *  - `numeric`: identificadores solo de digitos
 *  - `alphanumeric`: placas y codigos con letras
 *
 * NUMEROS Y LETRAS SEPARADOS
 * --------------------------
 * Antes los digitos eran una fila mas encima de la Q: mismo tamano, mismo color,
 * pegados a las letras. Quien llega con una placa (`ABC123`) o con un codigo
 * (`A7B48`) salta entre los dos grupos todo el tiempo, y con los dos
 * indistinguibles se pierde en cada salto.
 *
 * Ahora son dos bloques separados que se distinguen por la superficie, no por
 * un rotulo: los numeros son teclas BLANCAS sobre una bandeja gris (como el
 * teclado numerico de la referencia) y las letras son teclas GRISES sobre el
 * blanco de la pantalla. La forma del bloque ya dice donde esta cada cosa.
 * La tecla que se pulsa se enciende en amarillo: es el color del "esto hiciste".
 *
 * Las filas de letras conservan la disposicion QWERTY con el escalonado real,
 * porque un operario que ya conoce un teclado encuentra la letra sin leerla.
 */

import { MdBackspace } from 'react-icons/md';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

/** Tecla de letra y de accion: gris sobre el blanco de la pantalla. */
const KEY =
  'flex items-center justify-center rounded-[0.9rem] bg-[var(--surface-tile)] font-semibold text-[var(--text-primary)] ' +
  'transition-[background-color,transform] duration-100 ' +
  'hover:bg-[var(--surface-tile-hover)] active:scale-[0.96] active:bg-brand-500 active:text-ink-950 ' +
  'select-none';

/** Tecla de numero: blanca y en relieve, sobre su bandeja gris. */
const NUM_KEY =
  'tnum flex items-center justify-center rounded-[0.9rem] bg-[var(--surface-raised)] font-bold text-[var(--text-primary)] ' +
  'shadow-[0_1px_3px_rgb(11_11_11/0.08)] ring-1 ring-inset ring-[var(--line-subtle)] transition-[background-color,transform] duration-100 ' +
  'hover:bg-[var(--surface-raised-hover)] active:scale-[0.96] active:bg-brand-500 active:text-ink-950 active:ring-brand-500 ' +
  'select-none';

function BackspaceIcon() {
  return <MdBackspace className="h-7 w-7 kshort:h-5 kshort:w-5" aria-hidden focusable="false" />;
}

export function Keypad({
  mode,
  onKey,
  onBackspace,
  onClear,
}: {
  mode: 'alphanumeric' | 'numeric';
  onKey: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}) {
  if (mode === 'numeric') {
    return (
      <div className="mx-auto grid w-full max-w-[26rem] grid-cols-3 gap-3 rounded-[1.4rem] bg-[var(--surface-tile)] p-3 kland:max-w-md">
        {DIGITS.slice(0, 9).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={`${NUM_KEY} min-h-[4.4rem] text-[2rem] kshort:min-h-14 kshort:text-2xl`}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          className={`${NUM_KEY} min-h-[4.4rem] text-lg kshort:min-h-14 kshort:text-sm`}
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={() => onKey('0')}
          className={`${NUM_KEY} min-h-[4.4rem] text-[2rem] kshort:min-h-14 kshort:text-2xl`}
        >
          0
        </button>
        <button
          type="button"
          onClick={onBackspace}
          aria-label="Borrar un carácter"
          className={`${NUM_KEY} min-h-[4.4rem] kshort:min-h-14`}
        >
          <BackspaceIcon />
        </button>
      </div>
    );
  }

  const letra = `${KEY} min-h-[3.5rem] text-[1.45rem] kland:min-h-14 kshort:min-h-11 kshort:text-base`;
  const numero = `${NUM_KEY} min-h-[3.5rem] text-[1.6rem] kland:min-h-14 kshort:min-h-11 kshort:text-lg`;

  return (
    <div className="w-full space-y-4 kshort:space-y-2">
      {/* -------------------------------------------------------- Numeros */}
      <section aria-label="Números" className="rounded-[1.2rem] bg-[var(--surface-tile)] p-2.5 kshort:p-2">
        <div className="grid grid-cols-10 gap-2">
          {DIGITS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              className={numero}
            >
              {key}
            </button>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- Letras */}
      <section aria-label="Letras" className="px-2.5 kshort:px-2">
        <div className="space-y-1.5">
          <div className="grid grid-cols-10 gap-2">
            {ROW_1.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onKey(key)}
                className={letra}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Escalonado real del QWERTY: media tecla de sangria a cada lado. */}
          <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-2">
            <span aria-hidden="true" />
            {ROW_2.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onKey(key)}
                className={`${letra} col-span-2`}
              >
                {key}
              </button>
            ))}
            <span aria-hidden="true" />
          </div>

          <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-2">
            <span aria-hidden="true" className="col-span-3" />
            {ROW_3.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onKey(key)}
                className={`${letra} col-span-2`}
              >
                {key}
              </button>
            ))}
            <span aria-hidden="true" className="col-span-3" />
          </div>
        </div>
      </section>

      {/* Borrar queda fuera de los dos bloques: no es ni numero ni letra, y asi
          no se pulsa por error al buscar la M o el 0. */}
      <div className="grid grid-cols-2 gap-2 px-2.5 kshort:px-2">
        <button
          type="button"
          onClick={onClear}
          className={`${KEY} min-h-[3.5rem] text-lg font-bold kshort:min-h-11 kshort:text-sm`}
        >
          Borrar todo
        </button>
        <button
          type="button"
          onClick={onBackspace}
          aria-label="Borrar un carácter"
          className={`${KEY} min-h-[3.5rem] gap-2.5 text-lg font-bold kshort:min-h-11 kshort:text-sm`}
        >
          <BackspaceIcon />
          Borrar
        </button>
      </div>
    </div>
  );
}
