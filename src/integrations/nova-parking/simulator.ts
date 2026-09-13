import { AppError } from '@/lib/errors';
import { db } from '@/lib/db';
import { NovaParkingClient } from './client';
import type { NovaCheckout, NovaTicket } from './types';

/**
 * Sistema del parqueadero SIMULADO, para el modo de pruebas.
 *
 * PARA QUE: probar el kiosco de verdad (escaner QR, impresora, datafono de Redeban y
 * factura de SIIGO) sin depender del tunel ni del servidor del parqueadero. Se activa
 * por parqueadero desde la ficha del sitio (`ParkingLot.testMode`); la conexion real
 * (`novaBaseUrl` y su token) no se toca y vuelve a usarse al apagarlo.
 *
 * QUE HACE
 *   - Cualquier placa valida (ABC123, ABC12D) es un carro adentro.
 *   - Cualquier codigo valido (A7B48) es una moto, bici o patineta adentro.
 *   - `ZZZ999` y `Z9Z99` no existen, para probar el "no encontramos tu vehiculo".
 *   - Cobra valores fijos y bajos: se cobran de verdad en el datafono de pruebas.
 *   - Confirma el pago como lo haria el sistema real, y durante 15 minutos ese
 *     tiquete aparece "ya pagado" (sale del historial de pagos de esta web).
 *   - El panel del administrador no tiene datos simulados: sus consultas responden
 *     "no disponible".
 *
 * Nunca se activa solo: solo con el interruptor del SuperAdmin.
 */

const CATALOGO = [
  { id: 1, label: 'Carro' },
  { id: 2, label: 'Motocicleta' },
  { id: 3, label: 'Bicicleta' },
  { id: 4, label: 'Patinete Eléctrico' },
  { id: 5, label: 'Por Definir' },
];

/** Tarifa de prueba por id del catalogo de arriba, en pesos. */
export const TARIFA_PRUEBA: Record<string, number> = {
  '1': 2000,
  '2': 1500,
  '3': 1000,
  '4': 1000,
  '5': 1500,
};

export const NO_EXISTE = { placa: 'ZZZ999', codigo: 'Z9Z99' };

const PLACA = /^[A-Z]{3}\d{2}[A-Z0-9]$/;
const CODIGO = /^[A-HJ-NP-Z][0-9][A-HJ-NP-Z][0-9]{2}$/;
const MINUTOS_PARA_SALIR = 15;

/** Permanencia estable para un mismo vehiculo (entre 35 min y 3 h 35 min). */
function permanencia(identificador: string): number {
  let h = 0;
  for (const c of identificador) h = (h * 31 + c.charCodeAt(0)) % 997;
  return 35 + (h % 180);
}

function tiquete(identificador: string, esCarro: boolean): NovaTicket {
  const minutos = permanencia(identificador);
  return {
    id: `sim-${esCarro ? 'placa' : 'codigo'}-${identificador}`,
    code: esCarro ? null : identificador,
    plate: esCarro ? identificador : null,
    vehicleTypeLabel: esCarro ? 'Carro' : 'Por Definir',
    entryAt: new Date(Date.now() - minutos * 60_000).toISOString(),
    minutes: minutos,
    customerName: null,
    customerDocument: null,
    status: 'IN',
  };
}

export class SimulatedNovaParkingClient extends NovaParkingClient {
  private readonly parkingLotId: string;

  constructor(parkingLotId: string) {
    super({ baseUrl: 'https://simulado.invalid' });
    this.parkingLotId = parkingLotId;
  }

  override async health(): Promise<{ ok: boolean; detail: string }> {
    return {
      ok: true,
      detail: 'Modo de pruebas: el sistema del parqueadero esta simulado dentro de la web.',
    };
  }

  override async read<T = unknown>(path: string): Promise<T> {
    if (path === '/api/parking/vehicleType/') return CATALOGO as T;
    throw new AppError('NOT_FOUND', {
      publicMessage: 'En modo de pruebas esta consulta no esta disponible.',
      detail: { path, modo: 'pruebas' },
    });
  }

  override async findTicket(segment: string, term: string): Promise<NovaTicket | null> {
    const limpio = term.toUpperCase().replace(/[\s.-]/g, '');
    if (segment === 'car') {
      return PLACA.test(limpio) && limpio !== NO_EXISTE.placa ? tiquete(limpio, true) : null;
    }
    return CODIGO.test(limpio) && limpio !== NO_EXISTE.codigo ? tiquete(limpio, false) : null;
  }

  override async getCheckout(ticketId: string, vehicleTypeId?: string | null): Promise<NovaCheckout> {
    const partes = ticketId.match(/^sim-(placa|codigo)-([A-Z0-9]+)$/);
    if (!partes) {
      throw new AppError('NOT_FOUND', {
        publicMessage: 'No encontramos el registro en el sistema del parqueadero.',
        detail: { ticketId, modo: 'pruebas' },
      });
    }
    const esCarro = partes[1] === 'placa';
    const datos = tiquete(partes[2], esCarro);

    // "Ya pagado" durante el tiempo para salir, igual que el sistema real.
    const pago = await db.payment.findFirst({
      where: {
        parkingLotId: this.parkingLotId,
        externalTicketId: ticketId,
        status: 'APPROVED',
        resolvedAt: { gte: new Date(Date.now() - MINUTOS_PARA_SALIR * 60_000) },
      },
      orderBy: { resolvedAt: 'desc' },
      select: { resolvedAt: true },
    });
    if (pago?.resolvedAt) {
      const transcurridos = Math.floor((Date.now() - pago.resolvedAt.getTime()) / 60_000);
      return {
        ticket: datos,
        amount: 0,
        alreadyPaid: true,
        minutesLeft: Math.max(0, MINUTOS_PARA_SALIR - transcurridos),
      };
    }

    const tipo = vehicleTypeId ?? (esCarro ? '1' : '5');
    return { ticket: datos, amount: TARIFA_PRUEBA[tipo] ?? TARIFA_PRUEBA['5'], alreadyPaid: false };
  }

  override async confirmPayment(): Promise<{
    confirmed: boolean;
    retryable: boolean;
    detail: string | null;
  }> {
    return { confirmed: true, retryable: false, detail: null };
  }
}
