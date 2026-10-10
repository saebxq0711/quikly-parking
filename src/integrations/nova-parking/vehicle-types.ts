import type { VehicleIdentifierKind } from '@prisma/client';
import type { VehicleTypeConfig } from './types';

/**
 * Los cuatro tipos de vehiculo y como se identifica cada uno.
 *
 * DEFINIDO por Nova Parking, y CAMBIADO por ellos el 2026-09-11:
 *
 *  - **Carro** por PLACA.
 *  - **Moto, bicicleta y patineta** por CODIGO alfanumerico de 5 caracteres.
 *
 * Antes esos tres iban por numero de tiquete. El numero era el id
 * autoincremental de su base: secuencial, o sea que teniendo uno se deducen los
 * de al lado y se puede intentar cobrar o sacar un vehiculo ajeno. Lo
 * reemplazaron por un codigo aleatorio con restriccion unica, que es lo unico
 * que el cliente conoce — va impreso en su tiquete y dentro del QR.
 *
 * La moto va por codigo y no por placa porque el cliente confirmo que la lectura
 * de placa de moto por camara no es confiable: la placa cambia de posicion segun
 * la moto.
 *
 * El tipo tampoco se sabe al entrar: la camara solo distingue "tiene placa"
 * (Carro) de "no tiene" (Por Definir). Lo elige la persona a la salida, en este
 * kiosco, y se le manda a Nova Parking al cotizar y al confirmar — ver
 * `src/lib/parking/nova-vehicle-types.ts`.
 *
 * Todo esto es configurable por parqueadero (`VehicleSearchRule`): estos son
 * los valores por defecto, no una atadura.
 */
export const VEHICLE_TYPES: VehicleTypeConfig[] = [
  {
    type: 'CAR',
    label: 'Carro',
    identifierKind: 'PLATE',
    searchSegment: 'car',
    inputLabel: 'Placa del vehiculo',
    inputPlaceholder: 'ABC123',
  },
  {
    type: 'MOTORCYCLE',
    label: 'Moto',
    identifierKind: 'CODE',
    // `bike` y no `moto`: desde el 2026-09-11 una moto que la camara no leyo
    // entra como "Por Definir" y sin placa, y `find-ticket/moto/` filtra por tipo
    // Motocicleta, asi que no la encuentra. `bike` filtra por ausencia de placa.
    // La consulta prueba `moto` como respaldo para las que si quedaron tipadas.
    searchSegment: 'bike',
    inputLabel: 'Codigo del tiquete',
    inputPlaceholder: 'A7B48',
  },
  {
    type: 'SCOOTER',
    label: 'Patineta',
    identifierKind: 'CODE',
    searchSegment: 'bike',
    inputLabel: 'Codigo del tiquete',
    inputPlaceholder: 'A7B48',
  },
  {
    type: 'BICYCLE',
    label: 'Bicicleta',
    identifierKind: 'CODE',
    searchSegment: 'bike',
    inputLabel: 'Codigo del tiquete',
    inputPlaceholder: 'A7B48',
  },
];

export function getVehicleConfig(type: string): VehicleTypeConfig | undefined {
  return VEHICLE_TYPES.find((v) => v.type === type);
}

/**
 * Normaliza lo que digita el cliente segun el tipo de identificador.
 *
 * Para el CODIGO se traduce **I -> 1 y O -> 0**. El alfabeto del codigo excluye
 * esas dos letras justamente porque se confunden con el uno y el cero al
 * teclear, asi que quien escriba `AIB48` quiso decir `A1B48`. Traducirlo acierta
 * siempre; rechazarlo dejaria al cliente atascado sin entender por que.
 */
export function normalizeIdentifier(
  raw: string,
  kind: VehicleIdentifierKind,
): string {
  const trimmed = raw.trim().toUpperCase();

  if (kind === 'TICKET_ID') {
    // Un lector de codigos puede traer saltos de linea o separadores.
    return trimmed.replace(/\D/g, '');
  }

  const limpio = trimmed.replace(/[^A-Z0-9]/g, '');
  return kind === 'CODE' ? limpio.replace(/I/g, '1').replace(/O/g, '0') : limpio;
}

/** Validacion de forma antes de gastar una llamada al sistema existente. */
export function isValidIdentifier(
  value: string,
  kind: VehicleIdentifierKind,
): boolean {
  if (kind === 'PLATE') {
    // Placas colombianas: 6 caracteres (ABC123 carro, ABC12D moto).
    // Se acepta 5 a 7 para no rechazar casos legitimos poco comunes.
    return /^[A-Z0-9]{5,7}$/.test(value);
  }
  if (kind === 'TICKET_ID') return /^\d{1,14}$/.test(value);

  /*
    CODE: letra · numero · letra · numero · numero (`A7B48`), sin I ni O.

    Se acepta ademas un numero suelto: Nova Parking sigue admitiendo el id viejo
    de forma transitoria, porque los vehiculos que ya estaban adentro el dia del
    cambio llevan un QR con el numero anterior y tienen que poder salir. Cuando
    ellos lo retiren, sobra esta segunda alternativa.
  */
  return /^[A-HJ-NP-Z][0-9][A-HJ-NP-Z][0-9]{2}$/.test(value) || /^\d{1,14}$/.test(value);
}

/** Lo que se busca en el sistema del parqueadero, ya reconocido. */
export interface SearchTerm {
  kind: VehicleIdentifierKind;
  value: string;
}

/** Forma exacta del QR del tiquete: el numero con ceros a la izquierda, 10 digitos. */
const NUMERO_DEL_QR = /^\d{10}$/;
const CODIGO = /^[A-HJ-NP-Z][0-9][A-HJ-NP-Z][0-9]{2}$/;

/**
 * Reconoce lo que escribio el cliente o leyo el escaner.
 *
 * Desde el 2026-10-10 Nova Parking busca el vehiculo por cuatro datos en
 * `find-ticket/car/` (MODIFICACIONES_CLAUDE_SERVIDOR.md): la placa, el numero del QR
 * con ceros (`0000000170`, lo que entrega el lector), el codigo (`Z1M14`) o el enlace
 * del QR (`https://.../t/Z1M14`). Antes el kiosco solo entendia placa o codigo, segun
 * el tipo elegido, y cortaba lo leido a 7 caracteres: el QR del tiquete no encontraba
 * nada.
 *
 * El numero solo se acepta con la forma del QR (10 digitos). El numero de tiquete es
 * secuencial: aceptar "170" escrito a mano dejaria a cualquiera recorrer los vehiculos
 * de otros probando numeros. Se conserva el numero corto solo donde ya se aceptaba
 * (`TICKET_ID` y el respaldo transitorio de `CODE`).
 *
 * Devuelve null si no es nada reconocible.
 */
export function recognizeSearchTerm(
  raw: string,
  configured: VehicleIdentifierKind,
): SearchTerm | null {
  const texto = raw.trim();
  // Un enlace: lo que importa es el ultimo tramo de la ruta (`/t/Z1M14`).
  const tramo = texto.includes('/')
    ? (texto.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() ?? '')
    : texto;
  const limpio = tramo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!limpio) return null;

  if (/^\d+$/.test(limpio)) {
    if (NUMERO_DEL_QR.test(limpio)) return { kind: 'TICKET_ID', value: limpio };
    if (configured !== 'PLATE' && /^\d{1,14}$/.test(limpio)) return { kind: 'TICKET_ID', value: limpio };
    return null;
  }

  // I y O no existen en los codigos: se leen como 1 y 0 (se confunden a la vista).
  const comoCodigo = limpio.replace(/I/g, '1').replace(/O/g, '0');
  if (CODIGO.test(comoCodigo)) return { kind: 'CODE', value: comoCodigo };

  if (configured === 'PLATE' && /^[A-Z0-9]{5,7}$/.test(limpio)) return { kind: 'PLATE', value: limpio };
  return null;
}
