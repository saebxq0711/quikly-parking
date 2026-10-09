/**
 * El trazo amarillo de la marca.
 *
 * Es la misma curva que subraya la "Q" del logo de Quikly Parking, llevada a la
 * esquina de la pantalla como una franja de senal. Aparece en el kiosco y en el
 * ingreso; nunca detras de texto ni de un control, siempre en el borde, porque
 * es marca y no contenido.
 *
 * Un solo trazo dibujado (un cuarto de anillo con las puntas sesgadas, como el
 * del logo), coloreado por `currentColor`: el amarillo lo pone quien lo usa.
 */
export function BrandSwoosh({
  className,
  corner = 'bottom-right',
}: {
  className?: string;
  corner?: 'bottom-right' | 'bottom-left';
}) {
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={corner === 'bottom-left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M 0 400 C 40 190 190 40 400 0 L 400 128 C 262 158 158 262 128 400 Z"
        fill="currentColor"
      />
    </svg>
  );
}
