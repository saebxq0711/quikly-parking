import { env } from '@/lib/env';
import type { ReceiptDocument, ReceiptRow } from '@/lib/printing/receipt-data';

/**
 * Envio de correo por Resend.
 *
 * Se habla con su API por `fetch` en vez de instalar su SDK: es una sola
 * peticion POST y no vale la pena una dependencia mas en algo que corre en el
 * servidor de una plataforma de pagos.
 *
 * Si no hay credenciales configuradas, `sendMail` devuelve `false` en vez de
 * lanzar. Quien llama decide que hacer — y en el caso del restablecimiento, lo
 * que hace es caer al flujo manual en vez de prometerle al usuario un correo
 * que nunca va a llegar.
 */

export function mailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    console.warn('[mail] sin credenciales de Resend: no se envio nada');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // El cuerpo puede traer el correo del destinatario; solo se registra el
      // codigo y el motivo, nunca el destinatario ni la clave.
      console.error('[mail] Resend rechazo el envio', {
        status: response.status,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[mail] no se pudo contactar a Resend', {
      name: error instanceof Error ? error.name : 'desconocido',
    });
    return false;
  }
}

/**
 * El logo, centrado en cualquier cliente de correo.
 *
 * Va en una TABLA y no en un `div` centrado: los clientes basados en Word
 * (Outlook de escritorio) ignoran `display:inline-block` y convierten el div en
 * un bloque de ancho completo — la placa oscura se estiraba de lado a lado y la
 * imagen quedaba pegada al borde izquierdo. Una tabla con `align="center"` es lo
 * unico que centra igual en todos.
 *
 * El alto va escrito (180x62 es la proporcion real del archivo) para que el
 * correo no salte al cargar la imagen, y el `alt` lleva estilo propio porque la
 * mayoria de las bandejas bloquean las imagenes la primera vez: si no se ve el
 * logo, se lee el nombre de la marca en su sitio y no un icono roto.
 */
function logoHtml(logoUrl: string): string {
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr>
            <td align="center" style="background-color:#0b0814;border-radius:12px;padding:14px 22px;">
              <img src="${logoUrl}" alt="Quikly Parking" width="180" height="62"
                   style="display:block;width:180px;height:62px;border:0;outline:none;text-decoration:none;color:#f5f2fb;font-family:'Segoe UI',Tahoma,sans-serif;font-size:18px;font-weight:700;">
            </td>
          </tr>
        </table>`;
}

/**
 * Plantilla del correo de restablecimiento.
 *
 * Detalles que no son decorativos:
 *
 *  - El logo va sobre una placa OSCURA declarada explicitamente. El logo de Quikly
 *    Parking lleva el texto en blanco, y los clientes de correo con modo oscuro
 *    invierten los fondos: sin una placa con color propio, en la mitad de las
 *    bandejas el nombre desaparece.
 *  - Tablas y estilos en linea, no flex ni clases: Outlook no entiende nada
 *    moderno y parte el diseno.
 *  - El enlace tambien va escrito en texto plano abajo, porque algunos clientes
 *    no dejan pulsar botones.
 */
export function resetPasswordEmail(options: {
  link: string;
  minutes: number;
  logoUrl: string;
}): string {
  return `
<div style="margin:0;padding:24px 12px;background:#0b0814;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#171126;border-radius:16px;border:1px solid #2c2741;">
    <tr>
      <td align="center" style="padding:32px 24px 8px;">
        ${logoHtml(options.logoUrl)}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 0;">
        <h1 style="margin:0 0 10px;font-size:21px;line-height:1.3;font-weight:700;color:#f5f2fb;text-align:center;">
          Restablece tu contrase&ntilde;a
        </h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#b3a9cc;text-align:center;">
          Alguien pidi&oacute; una nueva contrase&ntilde;a para tu cuenta.
          Pulsa el bot&oacute;n para elegirla.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;text-align:center;">
        <a href="${options.link}"
           style="display:inline-block;background:#6d2fd4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:10px;">
          Elegir mi contrase&ntilde;a
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 8px;">
        <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#b3a9cc;text-align:center;">
          El enlace vence en <b style="color:#dccbff;">${options.minutes} minutos</b>
          y solo puede usarse una vez.
        </p>
        <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#8a80a6;text-align:center;">
          Si no fuiste t&uacute;, no hagas nada: tu contrase&ntilde;a actual sigue
          funcionando. Pero si esto se repite, av&iacute;sale a quien administra
          la plataforma.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#7d7598;text-align:center;word-break:break-all;">
          Si el bot&oacute;n no funciona, copia esta direcci&oacute;n:<br>
          <span style="color:#a49dbd;">${options.link}</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;">
        <div style="height:1px;background:#2c2741;margin-bottom:16px;"></div>
        <p style="margin:0;font-size:11px;color:#7d7598;text-align:center;">
          Quikly Parking &middot; Gesti&oacute;n y cobro de parqueaderos
        </p>
      </td>
    </tr>
  </table>
</div>`.trim();
}

/** Los datos del comprobante los escribe el cliente (su nombre): nunca van crudos al HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function filasHtml(rows: ReceiptRow[]): string {
  return rows
    .map(
      (row) => `
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#b3a9cc;">${escapeHtml(row.label)}</td>
          <td style="padding:5px 0;font-size:13px;color:#f5f2fb;font-weight:600;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('');
}

/**
 * Plantilla del comprobante de pago. Mismo chasis que el correo de restablecimiento
 * (placa oscura para el logo, tablas y estilos en linea) y el mismo contenido que el
 * papel del kiosco.
 */
export function receiptEmail(options: { doc: ReceiptDocument; logoUrl: string }): string {
  const { doc } = options;

  const secciones = doc.sections
    .map(
      (seccion) => `
    <tr>
      <td style="padding:0 32px 18px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a80a6;">${escapeHtml(seccion.title)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${filasHtml(seccion.rows)}</table>
      </td>
    </tr>`,
    )
    .join('');

  const boton = doc.qrUrl
    ? `
    <tr>
      <td style="padding:4px 32px 24px;text-align:center;">
        <a href="${escapeHtml(doc.qrUrl)}" style="display:inline-block;background:#6d2fd4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:10px;">
          Ver mi factura
        </a>
      </td>
    </tr>`
    : '';

  return `
<div style="margin:0;padding:24px 12px;background:#0b0814;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#171126;border-radius:16px;border:1px solid #2c2741;">
    <tr>
      <td align="center" style="padding:32px 24px 8px;">
        ${logoHtml(options.logoUrl)}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 4px;text-align:center;">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9acb7c;">Pago aprobado</p>
        <h1 style="margin:8px 0 4px;font-size:20px;line-height:1.3;font-weight:700;color:#f5f2fb;">${escapeHtml(doc.title)}</h1>
        ${doc.headerLines.map((linea) => `<p style="margin:0;font-size:12px;line-height:1.6;color:#b3a9cc;">${escapeHtml(linea)}</p>`).join('')}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;text-align:center;">
        <div style="background:#0b0814;border-radius:12px;padding:18px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a80a6;">${escapeHtml(doc.heading)} &middot; ${escapeHtml(doc.issuedAt)}</p>
          <p style="margin:6px 0 0;font-size:34px;font-weight:800;color:#f5f2fb;">${escapeHtml(doc.total)}</p>
        </div>
      </td>
    </tr>
    ${secciones}
    ${boton}
    <tr>
      <td style="padding:0 32px 28px;">
        <div style="height:1px;background:#2c2741;margin-bottom:16px;"></div>
        <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#b3a9cc;text-align:center;">
          La factura electr&oacute;nica te llega en un correo aparte cuando se emite.
        </p>
        <p style="margin:0;font-size:11px;color:#7d7598;text-align:center;">
          Quikly Parking &middot; Gesti&oacute;n y cobro de parqueaderos
        </p>
      </td>
    </tr>
  </table>
</div>`.trim();
}
