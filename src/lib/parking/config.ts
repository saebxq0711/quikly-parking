import type { VehicleIdentifierKind, VehicleType } from '@prisma/client';
import { db } from '../db';
import { AppError } from '../errors';
import { getCredentials } from '../credentials';
import { NovaParkingClient } from '@/integrations/nova-parking/client';
import { VEHICLE_TYPES } from '@/integrations/nova-parking/vehicle-types';

/**
 * Configuracion de conexion y de busqueda POR PARQUEADERO.
 *
 * Cada parqueadero es un despliegue independiente de Nova Parking, con su
 * propio tunel de Cloudflare y su propio token. Esta plataforma es una sola web
 * que habla con muchos de ellos, asi que ni la URL ni el token viven en
 * variables de entorno: se configuran por parqueadero desde la administracion.
 * Agregar un sitio nuevo no puede exigir un despliegue.
 */

export interface ResolvedVehicleRule {
  vehicleType: VehicleType;
  label: string;
  identifierKind: VehicleIdentifierKind;
  searchSegment: string;
  /** Parametros extra de la consulta, como `by=id` para la moto. */
  searchQuery: string | null;
  inputLabel: string;
  inputPlaceholder: string;
  enabled: boolean;
  sortOrder: number;
  /** true si viene de una regla propia del parqueadero, no del valor por defecto. */
  overridden: boolean;
}

/**
 * Textos por defecto de la pantalla de identificacion.
 *
 * Se usan solo si el parqueadero no definio los suyos. Para moto, bicicleta y
 * patineta el identificador todavia esta por definir, asi que estos textos son
 * una suposicion razonable y no una afirmacion: cuando se sepa cual es, se
 * escribe en la regla del sitio y el kiosco lo pide con su nombre correcto.
 */
function defaultCopy(kind: VehicleIdentifierKind) {
  if (kind === 'PLATE') {
    return { inputLabel: 'Placa del vehiculo', inputPlaceholder: 'ABC123' };
  }
  if (kind === 'TICKET_ID') {
    return {
      inputLabel: 'Numero de tiquete',
      inputPlaceholder: '38',
    };
  }
  return {
    inputLabel: 'Codigo del tiquete',
    inputPlaceholder: 'A7B48',
  };
}

/**
 * Reglas efectivas de un parqueadero: las suyas si las definio, y si no las
 * predeterminadas del proyecto.
 */
export async function getVehicleRules(
  parkingLotId: string,
): Promise<ResolvedVehicleRule[]> {
  const custom = await db.vehicleSearchRule.findMany({
    where: { parkingLotId },
  });
  const byType = new Map(custom.map((rule) => [rule.vehicleType, rule]));

  return VEHICLE_TYPES.map((base, index) => {
    const rule = byType.get(base.type);
    const identifierKind = rule?.identifierKind ?? base.identifierKind;
    const copy = defaultCopy(identifierKind);

    return {
      vehicleType: base.type,
      label: base.label,
      identifierKind,
      searchSegment: rule?.searchSegment ?? base.searchSegment,
      searchQuery: rule?.searchQuery ?? base.searchQuery ?? null,
      inputLabel: rule?.inputLabel || copy.inputLabel,
      inputPlaceholder: rule?.inputPlaceholder || copy.inputPlaceholder,
      enabled: rule?.enabled ?? true,
      sortOrder: rule?.sortOrder ?? index,
      overridden: rule !== undefined,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getVehicleRule(
  parkingLotId: string,
  vehicleType: VehicleType,
): Promise<ResolvedVehicleRule> {
  const rules = await getVehicleRules(parkingLotId);
  const rule = rules.find((r) => r.vehicleType === vehicleType);

  if (!rule) {
    throw new AppError('VALIDATION', {
      publicMessage: 'Tipo de vehiculo no reconocido.',
    });
  }
  if (!rule.enabled) {
    throw new AppError('VALIDATION', {
      publicMessage: 'Este parqueadero no atiende ese tipo de vehiculo.',
    });
  }
  return rule;
}

/**
 * Cliente hacia el sistema del parqueadero indicado.
 *
 * Falla con un mensaje claro si el sitio no esta configurado, en vez de
 * intentar una consulta que no puede funcionar.
 */
export async function novaClientFor(
  parkingLotId: string,
): Promise<NovaParkingClient> {
  const lot = await db.parkingLot.findUnique({
    where: { id: parkingLotId },
    select: { id: true, novaBaseUrl: true, active: true, name: true },
  });

  if (!lot) throw new AppError('NOT_FOUND');
  if (!lot.active) {
    throw new AppError('FORBIDDEN', {
      publicMessage: 'Este parqueadero esta inactivo.',
    });
  }

  const baseUrl = lot.novaBaseUrl;
  if (!baseUrl) {
    throw new AppError('UPSTREAM_UNAVAILABLE', {
      publicMessage:
        'Este parqueadero no tiene configurada la conexion con su sistema.',
      detail: { parkingLotId, lot: lot.name },
    });
  }

  const credentials = await getCredentials({
    provider: 'NOVA_PARKING',
    parkingLotId,
  });

  return new NovaParkingClient({
    baseUrl,
    token: credentials.platformToken ?? null,
  });
}

/** Datos de conexion para mostrar en la interfaz del SuperAdmin. */
export async function getConnectionSummary(parkingLotId: string): Promise<{
  baseUrl: string | null;
  hasOwnToken: boolean;
}> {
  const [lot, credentials] = await Promise.all([
    db.parkingLot.findUnique({
      where: { id: parkingLotId },
      select: { novaBaseUrl: true },
    }),
    getCredentials({ provider: 'NOVA_PARKING', parkingLotId }),
  ]);

  return {
    baseUrl: lot?.novaBaseUrl ?? null,
    hasOwnToken: Boolean(credentials.platformToken),
  };
}
