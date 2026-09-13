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
 * Cual usa cada tipo de vehiculo lo decide la configuracion del parqueadero:
 * para moto, bicicleta y patineta el identificador todavia esta por definir.
 *
 * Las filas de letras conservan la disposicion QWERTY con el escalonado real,
 * porque un operario que ya conoce un teclado encuentra la letra sin leerla.
 */

import { MdBackspace } from 'react-icons/md';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

const KEY =
  'flex items-center justify-center rounded-xl bg-white/[0.05] font-semibold text-ink-100 ' +
  'ring-1 ring-inset ring-white/10 transition-colors duration-100 ' +
  'hover:bg-white/[0.11] active:bg-brand-600 active:ring-brand-400/40 ' +
  'select-none';

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
            className={`${KEY} min-h-18 text-3xl kshort:min-h-14 kshort:text-2xl`}
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
          className={`${KEY} min-h-18 text-3xl kshort:min-h-14 kshort:text-2xl`}
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

  const letterKey = `${KEY} min-h-14 text-lg kland:min-h-15 kshort:min-h-11 kshort:text-base`;

  return (
    <div className="w-full space-y-2.5">
      <div className="grid grid-cols-10 gap-1.5">
        {DIGITS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={letterKey}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-10 gap-1.5">
        {ROW_1.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={letterKey}
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
            className={`${letterKey} col-span-2`}
          >
            {key}
          </button>
        ))}
        <span aria-hidden="true" />
      </div>

      <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1.5">
        <button
          type="button"
          onClick={onClear}
          className={`${letterKey} col-span-3 text-sm`}
        >
          Borrar
        </button>
        {ROW_3.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={`${letterKey} col-span-2`}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={onBackspace}
          aria-label="Borrar un caracter"
          className={`${letterKey} col-span-3`}
        >
          <BackspaceIcon />
        </button>
      </div>
    </div>
  );
}
