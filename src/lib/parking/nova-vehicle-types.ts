import type { VehicleType } from '@prisma/client';
import { AppError } from '@/lib/errors';
import type { NovaParkingClient } from '@/integrations/nova-parking/client';

/**
 * Traduce el tipo que eligio el cliente al id del catalogo de Nova Parking.
 *
 * POR QUE EXISTE
 * --------------
 * Desde el 2026-09-11 la camara de entrada ya no adivina el tipo: con placa es
 * `Carro`, y sin placa el tiquete entra como `Por Definir`. El tipo real lo elige
 * la persona a la SALIDA — o sea, en este kiosco. Nova Parking cotiza con ese
 * tipo solo si se lo mandamos (`pay-checkout?vehicle_type=<id>`), y lo fija en el
 * tiquete al confirmar el cobro.
 *
 * Sin mandarlo, `Por Definir` se cotiza con la tarifa de Motocicleta, que es la
 * mas alta de las tres. Medido contra su sistema real, el mismo tiquete:
 *
 *     como Bicicleta    $   346.740
 *     como Patineta     $ 1.155.800
 *     sin tipo / Moto   $ 1.849.280
 *
 * Una bicicleta pagando cinco veces lo que debe.
 *
 * POR NOMBRE, NUNCA POR ID
 * ------------------------
 * Sus ids cambian entre instalaciones (en su base Motocicleta quedo en el 4
 * porque Bicicleta ya ocupaba el 2), y un mapa fijo de ids es exactamente el bug
 * que ellos mismos arrastraron tres veces. Se lee su catalogo y se busca por
 * nombre.
 */

const NOMBRES: Record<VehicleType, string[]> = {
  CAR: ['carro', 'automovil', 'auto'],
  MOTORCYCLE: ['motocicleta', 'moto'],
  BICYCLE: ['bicicleta', 'bici'],
  SCOOTER: ['patinete electrico', 'patinete', 'patineta'],
};

/** Minusculas y sin tildes: "Patinete Eléctrico" y "patinete electrico" son lo mismo. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/**
 * El catalogo son cinco filas que no cambian en el dia: se guarda por
 * parqueadero (cada uno es una instalacion distinta, con sus propios ids) y se
 * refresca cada tanto por si alguien lo edita.
 */
const cache = new Map<string, { vence: number; ids: Map<VehicleType, string> }>();
const VIGENCIA_MS = 10 * 60_000;

async function catalogo(
  client: NovaParkingClient,
  parkingLotId: string,
): Promise<Map<VehicleType, string>> {
  const guardado = cache.get(parkingLotId);
  if (guardado && guardado.vence > Date.now()) return guardado.ids;

  const filas = await client.read<unknown>('/api/parking/vehicleType/', {}, 'vehicleTypes');
  const porNombre = new Map<string, string>();
  for (const fila of Array.isArray(filas) ? filas : []) {
    if (typeof fila !== 'object' || fila === null) continue;
    const { id, label } = fila as { id?: unknown; label?: unknown };
    if ((typeof id === 'number' || typeof id === 'string') && typeof label === 'string') {
      porNombre.set(normalizar(label), String(id));
    }
  }

  const ids = new Map<VehicleType, string>();
  for (const [tipo, alias] of Object.entries(NOMBRES) as [VehicleType, string[]][]) {
    const id = alias.map((a) => porNombre.get(a)).find(Boolean);
    if (id) ids.set(tipo, id);
  }

  cache.set(parkingLotId, { vence: Date.now() + VIGENCIA_MS, ids });
  return ids;
}

/**
 * Id del tipo para COTIZAR. Falla cerrado.
 *
 * Si no se puede resolver, no se cotiza: cobrar sin tipo es cobrar la tarifa de
 * moto, y preferimos que el cliente no pueda pagar a que pague de mas.
 */
export async function novaVehicleTypeId(
  client: NovaParkingClient,
  parkingLotId: string,
  vehicleType: VehicleType,
): Promise<string> {
  let ids: Map<VehicleType, string>;
  try {
    ids = await catalogo(client, parkingLotId);
  } catch (error) {
    throw new AppError('UPSTREAM_UNAVAILABLE', {
      publicMessage:
        'No fue posible calcular la tarifa de tu vehiculo en este momento. Intenta nuevamente.',
      detail: { operation: 'novaVehicleTypeId', vehicleType },
      cause: error,
    });
  }

  const id = ids.get(vehicleType);
  if (!id) {
    throw new AppError('UPSTREAM_UNAVAILABLE', {
      publicMessage:
        'No fue posible calcular la tarifa de tu vehiculo. Acercate a la oficina del parqueadero.',
      detail: {
        operation: 'novaVehicleTypeId',
        vehicleType,
        hint: 'El catalogo de Nova Parking no tiene un tipo con ese nombre.',
      },
    });
  }
  return id;
}

/**
 * Id del tipo para CONFIRMAR un cobro que ya se hizo. No falla nunca.
 *
 * Aqui el dinero ya salio de la cuenta del cliente. Si por algo no se puede
 * resolver el tipo, se confirma igual sin el: el vehiculo sale y el cobro queda
 * registrado con el valor que se cobro de verdad, y el tiquete solo se queda
 * como "Por Definir". Dejar al cliente atrapado en la barrera por eso seria peor.
 */
export async function novaVehicleTypeIdOrNull(
  client: NovaParkingClient,
  parkingLotId: string,
  vehicleType: VehicleType,
): Promise<string | null> {
  try {
    return (await catalogo(client, parkingLotId)).get(vehicleType) ?? null;
  } catch {
    return null;
  }
}
