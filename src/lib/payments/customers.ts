import type { Customer } from '@prisma/client';
import { db } from '../db';
import { AppError } from '../errors';
import { siigoClientFor } from '../parking/siigo';
import {
  createCustomer,
  findCustomerByIdentification,
} from '@/integrations/siigo/customers';
import {
  DEFAULT_DOCUMENT_TYPE,
  documentType,
  isValidDocument,
  normalizeDocument,
} from '@/lib/document-types';

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

/**
 * Lo que ve el kiosco de un cliente.
 *
 * `email` y `phone` salen ENMASCARADOS (`ju•••@hotmail.com`, `••• 4567`): basta
 * con escribir un documento para llegar aqui, y quien sepa la cedula de otro no
 * debe poder leer su correo ni su telefono. Al cliente le alcanza para reconocer
 * los suyos. Los datos completos no salen del servidor: al cobrar, `saveCustomer`
 * conserva los guardados si el kiosco no manda otros.
 */
export interface CustomerView {
  found: boolean;
  /** Tipo de documento (codigo de SIIGO: 13 cedula, 31 NIT...). */
  idType: string;
  identification: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

const OCULTO = '•••';

/** `jsebas@hotmail.com` -> `js•••@hotmail.com`. El dominio queda: es de todos. */
export function maskEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  if (arroba < 1) return OCULTO;
  const usuario = email.slice(0, arroba);
  // Con un usuario muy corto, dos letras serian casi todo: se deja una.
  const visibles = usuario.length > 4 ? 2 : 1;
  return `${usuario.slice(0, visibles)}${OCULTO}${email.slice(arroba)}`;
}

/** `3001234567` -> `••• 4567`. Largo fijo: tampoco se revela cuantos digitos tiene. */
export function maskPhone(phone: string): string {
  const digitos = phone.replace(/\D/g, '');
  return digitos.length > 4 ? `${OCULTO} ${digitos.slice(-4)}` : OCULTO;
}

function toView(customer: {
  idType: string;
  identification: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}): CustomerView {
  return {
    found: true,
    idType: customer.idType,
    identification: customer.identification,
    firstName: customer.firstName,
    lastName: customer.lastName,
    fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
    phone: customer.phone ? maskPhone(customer.phone) : null,
    email: customer.email ? maskEmail(customer.email) : null,
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
  /** Codigo de SIIGO del tipo de documento. Sin el, cedula (los kioscos de antes). */
  idType?: string;
  identification: string;
}): Promise<CustomerView> {
  const idType = params.idType ?? DEFAULT_DOCUMENT_TYPE;
  const identification = normalizeDocument(idType, params.identification);

  if (!isValidDocument(idType, identification)) {
    throw new AppError('VALIDATION', {
      publicMessage: `El numero de ${documentType(idType).label.toLowerCase()} no es valido.`,
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
  /*
    Mismo numero con OTRO tipo (la cedula 900123456 y el NIT 900123456 son
    terceros distintos): no se saluda a esa persona. Se piden los datos y, al
    guardar, el registro queda con el tipo que se eligio ahora.
  */
  if (local) {
    return local.idType === idType ? toView(local) : notFound(idType, identification);
  }

  try {
    const client = await siigoClientFor(params.parkingLotId);
    const remote = await findCustomerByIdentification(client, identification);

    if (remote && remote.idType === idType) {
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

  return notFound(idType, identification);
}

function notFound(idType: string, identification: string): CustomerView {
  return {
    found: false,
    idType,
    identification,
    firstName: '',
    lastName: '',
    fullName: '',
    phone: null,
    email: null,
  };
}

export interface CustomerInput {
  /** Codigo de SIIGO del tipo de documento. Sin el, cedula. */
  idType?: string;
  identification: string;
  /** Nombres, o la razon social si es una empresa (NIT). */
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
  const idType = params.input.idType ?? DEFAULT_DOCUMENT_TYPE;
  const identification = normalizeDocument(idType, params.input.identification);
  if (!isValidDocument(idType, identification)) {
    throw new AppError('VALIDATION', {
      publicMessage: `El numero de ${documentType(idType).label.toLowerCase()} no es valido.`,
    });
  }

  const phone = params.input.phone?.trim() || null;
  const email = params.input.email?.trim().toLowerCase() || null;
  const data = {
    identification,
    idType,
    firstName: params.input.firstName.trim(),
    // Una empresa tiene razon social, no apellidos.
    lastName: documentType(idType).company ? '' : params.input.lastName.trim(),
  };

  const llave = { parkingLotId_identification: { parkingLotId: params.parkingLotId, identification } };
  // Mismo numero con otro tipo de documento: en SIIGO es otro tercero, hay que crearlo.
  const anterior = await db.customer.findUnique({ where: llave, select: { idType: true } });
  const otroTercero = anterior !== null && anterior.idType !== idType;

  const customer = await db.customer.upsert({
    where: llave,
    // El kiosco nunca tiene el correo ni el telefono completos de un cliente que
    // ya existe (ver CustomerView): si no manda uno nuevo, se conserva el guardado.
    update: {
      ...data,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(otroTercero ? { siigoId: null } : {}),
    },
    create: { parkingLotId: params.parkingLotId, ...data, phone, email },
  });

  if (customer.siigoId) return customer;

  try {
    const client = await siigoClientFor(params.parkingLotId);
    const created = await createCustomer(client, {
      identification: customer.identification,
      idType: customer.idType,
      firstName: customer.firstName,
      lastName: customer.lastName,
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
