import { z } from 'zod';
import { DEFAULT_DOCUMENT_TYPE, DOCUMENT_TYPE_CODES } from '@/lib/document-types';

/**
 * Datos del cliente tal como llegan del kiosco, para la factura a su nombre.
 * Los usan el cobro (`/api/pos/payments`) y la eleccion de la factura despues de
 * pagar (`/api/pos/payments/[id]/factura`).
 */
export const customerInputSchema = z.object({
  /** Codigo de SIIGO del tipo de documento (13 cedula, 31 NIT...). Sin el, cedula. */
  idType: z.enum(DOCUMENT_TYPE_CODES).optional().default(DEFAULT_DOCUMENT_TYPE),
  identification: z.string().min(1).max(30),
  /** Nombres, o la razon social si es una empresa. */
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(80).optional().default(''),
  phone: z.string().max(30).optional(),
  /**
   * A donde van el comprobante y la factura electronica. No se exige: hay clientes
   * sin correo. Sin el, la factura se emite igual y el comprobante queda en pantalla.
   * Vacio en un cliente que ya existe: se conserva el que tiene guardado.
   */
  email: z
    .string()
    .trim()
    .max(120)
    .refine(
      (valor) => valor === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor),
      'Escribe un correo valido: ahi te enviamos la factura electronica.',
    )
    .optional(),
});
