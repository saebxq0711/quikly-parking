/**
 * Motivos de rechazo de SIIGO en lenguaje entendible.
 *
 * SIIGO responde `{ Status, Errors: [{ Code, Message, Params }] }` en ingles y con
 * codigos genericos: "The send cannot be used, you must verify the document settings"
 * no le dice al SuperAdmin que lo que tiene que cambiar es el comprobante. Los casos
 * que ya se vieron en el ambiente real se traducen; el resto pasa tal cual, para no
 * esconder un motivo que no conocemos.
 */

interface SiigoErrorItem {
  Code?: string;
  Message?: string;
  Params?: string[];
}

function traducir(error: SiigoErrorItem): string | null {
  const code = error.Code ?? '';
  const params = (error.Params ?? []).join(' ');
  const message = error.Message ?? '';

  if (code === 'document_settings') {
    if (/stamp/i.test(params) || /send cannot/i.test(message)) {
      return 'El comprobante no admite el envio a la DIAN que esta configurado: usa un comprobante de factura electronica con el envio activado, o uno no electronico con el envio desactivado.';
    }
    if (/seller/i.test(params) || /seller/i.test(message)) {
      return 'El vendedor configurado no esta habilitado para ese comprobante en SIIGO.';
    }
    return 'SIIGO no permite esa combinacion con el comprobante configurado. Revisa el comprobante en SIIGO Nube.';
  }
  if (code === 'already_exists' || /already exists/i.test(message)) {
    return 'SIIGO ya tiene un documento igual a este.';
  }
  if (code === 'invalid_partner_id' || /partner/i.test(code)) {
    return 'SIIGO no reconoce el identificador de la aplicacion (Partner-Id).';
  }
  if (/product|item/i.test(params) && /not.*(found|exist)|invalid/i.test(message)) {
    return 'El servicio de parqueadero configurado no existe en SIIGO.';
  }
  if (/payment/i.test(params) && /not.*(found|exist)|invalid/i.test(message)) {
    return 'La forma de pago configurada no existe o no aplica a este comprobante.';
  }
  return null;
}

/** Motivo legible del cuerpo de error de SIIGO, o null si no trae errores. */
export function describeSiigoErrors(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const errors = (body as { Errors?: unknown }).Errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const motivos = (errors as SiigoErrorItem[]).map((error) => {
    const original = error.Params?.length
      ? `${error.Message} (${error.Params.join(', ')})`
      : error.Message;
    return traducir(error) ?? original;
  });

  return [...new Set(motivos.filter(Boolean))].join(' | ') || null;
}
