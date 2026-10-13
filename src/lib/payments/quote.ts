import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VehicleType } from '@prisma/client';
import { env } from '../env';
import { MAX_AMOUNT } from '@/integrations/sipconnector/codec';

/**
 * Cotizacion congelada: el valor que se le mostro al cliente es el que se cobra.
 *
 * Decision del dueno del parqueadero (2026-10-13): si la tarifa sigue corriendo mientras
 * el cliente confirma, NO se actualiza. Se cobra lo que vio.
 *
 * El valor lo sigue fijando el servidor (regla 14 de la guia de certificacion de
 * Redeban): al consultar el vehiculo, el servidor firma {parqueadero, tiquete, tipo de
 * vehiculo, valor, hora} con su secreto, y al cobrar solo acepta ese valor si la firma
 * cuadra. Cambiarlo desde el navegador rompe la firma. Vence a los 15 minutos; el kiosco
 * vuelve al inicio mucho antes (90 s sin uso), asi que en la practica nunca llega a vencer.
 *
 * Al sistema del parqueadero se le confirma el valor cobrado: su `confirmar-externo`
 * registra el monto que recibe, asi que no hace falta cambiar nada alla.
 */

const VIGENCIA_MS = 15 * 60_000;

interface Cotizacion {
  parkingLotId: string;
  ticketId: string;
  vehicleType: VehicleType;
  amount: number;
}

function firma(datos: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`cotizacion:${datos}`).digest('base64url');
}

/** Cotizacion firmada para el valor que se le muestra al cliente. */
export function firmarCotizacion(c: Cotizacion, ahora = Date.now()): string {
  const datos = [c.parkingLotId, c.ticketId, c.vehicleType, String(c.amount), String(ahora)].join('|');
  return `${Buffer.from(datos).toString('base64url')}.${firma(datos)}`;
}

/**
 * El valor de una cotizacion, si es legitima, de ESTE tiquete y tipo de vehiculo en este
 * parqueadero, y esta vigente. Si no, null.
 */
export function leerCotizacion(
  token: string,
  esperado: Omit<Cotizacion, 'amount'>,
  ahora = Date.now(),
): number | null {
  const [cuerpo, firmaRecibida] = token.split('.');
  if (!cuerpo || !firmaRecibida) return null;

  let datos: string;
  try {
    datos = Buffer.from(cuerpo, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const esperada = Buffer.from(firma(datos));
  const recibida = Buffer.from(firmaRecibida);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  const [parkingLotId, ticketId, vehicleType, monto, emitida] = datos.split('|');
  if (
    parkingLotId !== esperado.parkingLotId ||
    ticketId !== esperado.ticketId ||
    vehicleType !== esperado.vehicleType
  ) {
    return null;
  }

  const edad = ahora - Number(emitida);
  if (!Number.isFinite(edad) || edad < 0 || edad > VIGENCIA_MS) return null;

  const amount = Number(monto);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  return amount;
}
