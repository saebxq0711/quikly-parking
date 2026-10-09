import Image from 'next/image';

/**
 * La escena de la bienvenida del kiosco: dos franjas amarillas y el sedan.
 *
 * Como en la referencia, las franjas son dos CUARTOS DE ANILLO que nacen de las
 * esquinas inferiores, cada uno centrado en su esquina, con los dos extremos
 * escondidos en los bordes de la pantalla. Por eso no se ven "puestas": no hay
 * una sola punta cortada a la vista, solo la curva entrando y saliendo.
 *
 *   - La izquierda es chica y queda casi entera a la vista, bajo el frente del
 *     carro.
 *   - La derecha es grande y la tapa el carro: solo asoma la punta por encima
 *     del baul, que es lo que en la referencia hace que el carro parezca salir
 *     de la marca.
 *
 * El carro es grande a proposito (mas ancho que la pantalla), cortado por la
 * derecha y por abajo: se lee como una foto, no como un icono pegado.
 *
 * Todo en `rem`, asi que crece con la raiz del kiosco (25px en el 27"). Va
 * detras del contenido, a todo el ancho de la pantalla, y en horizontal no se
 * pinta: ahi no hay alto para el.
 */

/** Cuarto de anillo con el centro en la esquina inferior; grosor relativo al radio. */
function CuartoDeAnillo({
  esquina,
  grosor,
  className,
}: {
  esquina: 'izquierda' | 'derecha';
  /** Grosor de la franja como fraccion del radio exterior (0 a 1). */
  grosor: number;
  className: string;
}) {
  const r = 100;
  const ri = r * (1 - grosor);
  // Centro en (0,100) para la izquierda y en (100,100) para la derecha.
  const d =
    esquina === 'izquierda'
      ? `M 0 0 A ${r} ${r} 0 0 1 ${r} ${r} L ${ri} ${r} A ${ri} ${ri} 0 0 0 0 ${r - ri} Z`
      : `M ${r} 0 A ${r} ${r} 0 0 0 0 ${r} L ${r - ri} ${r} A ${ri} ${ri} 0 0 1 ${r} ${r - ri} Z`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function WelcomeScene() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[27rem] kland:hidden"
    >
      <CuartoDeAnillo
        esquina="izquierda"
        grosor={0.36}
        className="swoosh-in-left absolute bottom-0 left-0 h-[16.8rem] w-[16.8rem] text-brand-500"
      />
      <CuartoDeAnillo
        esquina="derecha"
        grosor={0.25}
        className="swoosh-in absolute bottom-0 right-0 h-[24.5rem] w-[24.5rem] text-brand-500"
      />
      <Image
        src="/kiosco/sedan.webp"
        alt=""
        width={1400}
        height={1005}
        priority
        unoptimized
        className="drive-in absolute -bottom-[10.5rem] left-[3.6rem] w-[50rem] max-w-none drop-shadow-[0_24px_30px_rgb(11_11_11/0.18)]"
      />
    </div>
  );
}
