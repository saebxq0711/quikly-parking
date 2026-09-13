import type { VehicleType } from '@prisma/client';
import type { IconType } from 'react-icons';
import {
  MdDirectionsCar,
  MdTwoWheeler,
  MdPedalBike,
  MdElectricScooter,
} from 'react-icons/md';

/**
 * Iconografia de los cuatro tipos de vehiculo (CLAUDE.md secciones 6 y 28).
 *
 * Son los iconos de Material Symbols (Google, Apache-2.0) via `react-icons`,
 * no dibujos propios: los cuatro salen de la misma familia, asi que comparten
 * peso optico y caja de 24 y se leen como un juego. Es el unico set gratuito
 * que cubre los cuatro vehiculos — Font Awesome Free no tiene patineta.
 *
 * Tampoco son emojis: cada sistema operativo los pinta distinto y en un kiosco
 * tactil se ven inconsistentes o directamente no cargan.
 */

const ICONS: Record<VehicleType, IconType> = {
  CAR: MdDirectionsCar,
  MOTORCYCLE: MdTwoWheeler,
  BICYCLE: MdPedalBike,
  SCOOTER: MdElectricScooter,
};

export function VehicleIcon({
  type,
  className = 'h-full w-full',
}: {
  type: VehicleType;
  className?: string;
}) {
  const Glyph = ICONS[type];
  return <Glyph className={className} aria-hidden focusable="false" />;
}
