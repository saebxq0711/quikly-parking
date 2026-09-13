import type { Customer } from '@prisma/client';
import { db } from '../db';
import { AppError } from '../errors';
import { siigoClientFor } from '../parking/siigo';
import {
  createCustomer,
  findCustomerByIdentification,
} from '@/integrations/siigo/customers';

/**
 * Clientes del kiosco.
 *
 * El cliente se identifica con su numero de documento. Si ya pago antes, el
 * kiosco lo saluda por su nombre y no le vuelve a pedir nada; si es la primera
 * vez, se le piden los datos una sola vez y quedan guardados.
 *
 * La busqueda mira primero la base local y solo consulta SIIGO si no lo
 * encuentra. Asi el saludo es inmediato y, si la facturacion esta caida, el
 * cobro sigue funcionando: la factura se emite despues.
 */

export interface CustomerView {
  found: boolean;
  identification: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

/** Solo digitos: un documento no lleva puntos ni espacios. */
export function normalizeIdentification(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidIdentification(value: string): boolean {
  return /^\d{5,15}$/.test(value);
}

function toView(customer: {
  identification: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}): CustomerView {
  return {
    found: true,
    identification: customer.identification,
    firstName: customer.firstName,
    lastName: customer.lastName,
    fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
    phone: customer.phone,
    email: customer.email,
  };
}

/**
 * Busca al cliente por documento: primero local, luego en SIIGO.
 *
 * Un fallo de SIIGO NO interrumpe el cobro: se responde "no encontrado" y se le
 * piden los datos, que es exactamente lo que pasaria con un cliente nuevo.
 */
export async function lookupCustomer(params: {
  parkingLotId: string;
  identification: string;
}): Promise<CustomerView> {
  const identification = normalizeIdentification(params.identification);

  if (!isValidIdentification(identification)) {
    throw new AppError('VALIDATION', {
      publicMessage: 'El numero de documento no es valido.',
    });
  }

  const local = await db.customer.findUnique({
    where: {
      parkingLotId_identification: {
        parkingLotId: params.parkingLotId,
        identification,
      },
    },
  });
  if (local) return toView(local);

  try {
    const client = await siigoClientFor(params.parkingLotId);
    const remote = await findCustomerByIdentification(client, identification);

    if (remote) {
      // Se guarda localmente para que la proxima vez el saludo no dependa de
      // que la facturacion responda.
      const saved = await db.customer.create({
        data: {
          parkingLotId: params.parkingLotId,
          identification: remote.identification,
          idType: remote.idType,
          firstName: remote.firstName,
          lastName: remote.lastName,
          phone: remote.phone,
          email: remote.email,
          siigoId: remote.siigoId,
        },
      });
      return toView(saved);
    }
  } catch (error) {
    // Facturacion sin configurar o caida: se trata como cliente nuevo.
    console.error('[customers] no se pudo consultar la facturacion', {
      parkingLotId: params.parkingLotId,
      error,
    });
  }

  return {
    found: false,
    identification,
    firstName: '',
    lastName: '',
    fullName: '',
    phone: null,
    email: null,
  };
}

export interface CustomerInput {
  identification: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
}

/**
 * Guarda al cliente antes de cobrar.
 *
 * Se registra localmente siempre, y se intenta crear en SIIGO. Si eso ultimo
 * falla, el cobro continua: el cliente ya esta guardado y la factura se puede
 * emitir despues. Bloquear un cobro porque la facturacion no responde seria
 * dejar al conductor sin poder salir.
 */
export async function saveCustomer(params: {
  parkingLotId: string;
  input: CustomerInput;
}): Promise<Customer> {
  const identification = normalizeIdentification(params.input.identification);

  const data = {
    identification,
    firstName: params.input.firstName.trim(),
    lastName: params.input.lastName.trim(),
    phone: params.input.phone?.trim() || null,
    email: params.input.email?.trim().toLowerCase() || null,
  };

  const customer = await db.customer.upsert({
    where: {
      parkingLotId_identification: {
        parkingLotId: params.parkingLotId,
        identification,
      },
    },
    update: data,
    create: { parkingLotId: params.parkingLotId, ...data },
  });

  if (customer.siigoId) return customer;

  try {
    const client = await siigoClientFor(params.parkingLotId);
    const created = await createCustomer(client, {
      identification: customer.identification,
      idType: customer.idType,
      firstName: customer.firstName,
      lastName: customer.lastName || customer.firstName,
      phone: customer.phone,
      email: customer.email,
    });

    if (created) {
      return db.customer.update({
        where: { id: customer.id },
        data: { siigoId: created.siigoId },
      });
    }
  } catch (error) {
    console.error('[customers] no se pudo crear en la facturacion', {
      identification,
      error,
    });
  }

  return customer;
}
