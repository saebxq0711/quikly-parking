import type { VehicleType } from '@prisma/client';

/**
 * Iconografia de los cuatro tipos de vehiculo (CLAUDE.md secciones 6 y 28).
 *
 * Son los dibujos propios de Quikly Parking (`public/kiosco/icono-*.png`): siluetas
 * negras macizas, de trazo redondeado, hechas como juego para que las cuatro
 * pesen lo mismo. Se pintan como MASCARA (`.vehicle-glyph` en globals.css): la
 * imagen solo aporta la forma y el color sale de `currentColor`, asi que el mismo
 * icono va negro en el mosaico, negro sobre el amarillo del elegido y blanco en el
 * tema noche, sin una imagen por cada estado.
 *
 * Los cuatro archivos tienen la misma caja (560x560) con el dibujo centrado, asi
 * que se alinean sin ajustes por icono.
 */

const ARCHIVO: Record<VehicleType, string> = {
  CAR: '/kiosco/icono-carro.png',
  MOTORCYCLE: '/kiosco/icono-moto.png',
  BICYCLE: '/kiosco/icono-bicicleta.png',
  SCOOTER: '/kiosco/icono-patineta.png',
};

export function VehicleIcon({
  type,
  className = 'h-full w-full',
}: {
  type: VehicleType;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`vehicle-glyph ${className}`}
      style={{ '--glyph': `url(${ARCHIVO[type]})` } as React.CSSProperties}
    />
  );
}
