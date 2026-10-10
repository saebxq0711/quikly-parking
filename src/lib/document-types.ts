/**
 * Tipos de documento del cliente, con los codigos de SIIGO.
 *
 * Fuente: documentacion de la API de SIIGO (siigoapi.docs.apiary.io), "Crear
 * cliente" > "Parametros para Colombia". Son los codigos de la DIAN:
 *
 *   13 Cedula de ciudadania       numerico, 3 a 13 digitos
 *   31 NIT                        numerico, 3 a 13 digitos (sin digito de verificacion:
 *                                 SIIGO lo calcula)
 *   22 Cedula de extranjeria      alfanumerico, 1 a 20
 *   41 Pasaporte                  alfanumerico, 1 a 20
 *   48 PPT                        alfanumerico, 1 a 20
 *   47 PEP                        alfanumerico, 1 a 20
 *   12 Tarjeta de identidad       alfanumerico, hasta 20
 *   42 Documento extranjero       alfanumerico, 1 a 20
 *   50 NIT de otro pais           alfanumerico, 1 a 20
 *
 * El catalogo trae otros (registro civil, NUIP, salvoconducto...) que no tiene
 * sentido ofrecer a quien paga un parqueadero; se agregan aqui si hace falta.
 *
 * Los NIT son EMPRESAS: en SIIGO van como `person_type: "Company"` y el nombre es la
 * razon social en un solo campo, no nombres y apellidos.
 */

export interface DocumentType {
  /** Codigo de SIIGO (`id_type`). */
  code: string;
  /** Como se nombra completo. */
  label: string;
  /** Como cabe en un boton o en el comprobante. */
  short: string;
  /** Solo digitos (se escribe con el teclado numerico). */
  numeric: boolean;
  /** Es una empresa: razon social en vez de nombres y apellidos. */
  company: boolean;
  min: number;
  max: number;
}

export const DOCUMENT_TYPES: DocumentType[] = [
  { code: '13', label: 'Cédula de ciudadanía', short: 'Cédula', numeric: true, company: false, min: 3, max: 13 },
  { code: '31', label: 'NIT', short: 'NIT', numeric: true, company: true, min: 3, max: 13 },
  { code: '22', label: 'Cédula de extranjería', short: 'C. extranjería', numeric: false, company: false, min: 1, max: 20 },
  { code: '41', label: 'Pasaporte', short: 'Pasaporte', numeric: false, company: false, min: 1, max: 20 },
  { code: '48', label: 'Permiso por protección temporal (PPT)', short: 'PPT', numeric: false, company: false, min: 1, max: 20 },
  { code: '47', label: 'Permiso especial de permanencia (PEP)', short: 'PEP', numeric: false, company: false, min: 1, max: 20 },
  { code: '12', label: 'Tarjeta de identidad', short: 'T. identidad', numeric: false, company: false, min: 1, max: 20 },
  { code: '42', label: 'Documento de identificación extranjero', short: 'Doc. extranjero', numeric: false, company: false, min: 1, max: 20 },
  { code: '50', label: 'NIT de otro país', short: 'NIT extranjero', numeric: false, company: true, min: 1, max: 20 },
];

export const DEFAULT_DOCUMENT_TYPE = '13';

/** Codigos validos, para validar lo que llega del kiosco. */
export const DOCUMENT_TYPE_CODES = DOCUMENT_TYPES.map((t) => t.code) as [string, ...string[]];

export function documentType(code: string | null | undefined): DocumentType {
  return DOCUMENT_TYPES.find((t) => t.code === code) ?? DOCUMENT_TYPES[0];
}

/**
 * El documento como lo guarda SIIGO: solo digitos en los numericos (sin puntos,
 * espacios ni el "-DV" de un NIT) y letras mayusculas y digitos en los demas.
 */
export function normalizeDocument(code: string, value: string): string {
  const tipo = documentType(code);
  if (tipo.numeric) {
    // Un NIT escrito con su digito de verificacion ("900123456-7"): el DV va aparte.
    const sinDv = tipo.company ? value.replace(/-\s*\d\s*$/, '') : value;
    return sinDv.replace(/\D/g, '');
  }
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidDocument(code: string, value: string): boolean {
  const tipo = DOCUMENT_TYPES.find((t) => t.code === code);
  if (!tipo) return false;
  const patron = tipo.numeric ? /^\d+$/ : /^[A-Z0-9]+$/;
  return patron.test(value) && value.length >= tipo.min && value.length <= tipo.max;
}

/** "NIT 900123456", "Cédula 1098765432": para mostrar en pantalla. */
export function formatDocument(code: string | null | undefined, value: string): string {
  return `${documentType(code).short} ${value}`;
}
