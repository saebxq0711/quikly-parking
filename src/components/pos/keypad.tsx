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
 * Ahora son dos bloques con su titulo, su superficie y su tono: los numeros en
 * aqua —el frio de la marca— y las letras en neutro. La forma del bloque ya dice
 * donde esta lo que se busca, antes de leer una sola tecla.
 *
 * Las filas de letras conservan la disposicion QWERTY con el escalonado real,
 * porque un operario que ya conoce un teclado encuentra la letra sin leerla.
 */

import { MdBackspace } from 'react-icons/md';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

/** Tecla neutra: letras y acciones. */
const KEY =
  'flex items-center justify-center rounded-xl bg-[var(--fill-soft)] font-semibold text-[var(--text-primary)] ' +
  'ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-100 ' +
  'hover:bg-[var(--fill-soft-hover)] active:bg-brand-600 active:text-white active:ring-brand-400/40 ' +
  'select-none';

/** Tecla de numero: mismo peso, distinto tono, para reconocer el bloque de lejos. */
const NUM_KEY =
  'tnum flex items-center justify-center rounded-xl bg-aqua-400/10 font-bold text-[var(--text-primary)] ' +
  'ring-1 ring-inset ring-aqua-400/35 transition-colors duration-100 ' +
  'hover:bg-aqua-400/20 active:bg-aqua-600 active:text-white ' +
  'select-none';

const TITULO =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]';

function BackspaceIcon() {
  return <MdBackspace className="h-5 w-5" aria-hidden focusable="false" />;
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
      <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3 kland:max-w-md">
        {DIGITS.slice(0, 9).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={`${NUM_KEY} min-h-18 text-3xl kshort:min-h-14 kshort:text-2xl`}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          className={`${KEY} min-h-18 text-base kshort:min-h-14 kshort:text-sm`}
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={() => onKey('0')}
          className={`${NUM_KEY} min-h-18 text-3xl kshort:min-h-14 kshort:text-2xl`}
        >
          0
        </button>
        <button
          type="button"
          onClick={onBackspace}
          aria-label="Borrar un caracter"
          className={`${KEY} min-h-18 kshort:min-h-14`}
        >
          <BackspaceIcon />
        </button>
      </div>
    );
  }

  const letra = `${KEY} min-h-14 text-lg kland:min-h-15 kshort:min-h-11 kshort:text-base`;
  const numero = `${NUM_KEY} min-h-14 text-xl kland:min-h-15 kshort:min-h-11 kshort:text-lg`;

  return (
    <div className="w-full space-y-3 kshort:space-y-2">
      {/* -------------------------------------------------------- Numeros */}
      <section className="rounded-2xl bg-aqua-400/[0.05] p-2.5 ring-1 ring-inset ring-aqua-400/20 kshort:p-2">
        <span className={TITULO}>Numeros</span>
        <div className="grid grid-cols-10 gap-1.5">
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
      <section className="rounded-2xl bg-[var(--fill-soft)] p-2.5 ring-1 ring-inset ring-[var(--ring-soft)] kshort:p-2">
        <span className={TITULO}>Letras</span>
        <div className="space-y-1.5">
          <div className="grid grid-cols-10 gap-1.5">
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
          <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1.5">
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

          <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1.5">
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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClear}
          className={`${KEY} min-h-13 text-sm font-bold uppercase tracking-wide kshort:min-h-11`}
        >
          Borrar todo
        </button>
        <button
          type="button"
          onClick={onBackspace}
          aria-label="Borrar un caracter"
          className={`${KEY} min-h-13 gap-2 text-sm font-bold uppercase tracking-wide kshort:min-h-11`}
        >
          <BackspaceIcon />
          Borrar
        </button>
      </div>
    </div>
  );
}
