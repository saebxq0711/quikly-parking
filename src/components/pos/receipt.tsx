'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { ReceiptDocument } from '@/lib/printing/receipt-data';

/**
 * Comprobante de pago en la pantalla del kiosco.
 *
 * Es lo que ve el cliente cuando el kiosco no tiene impresora (o no respondio): el
 * mismo documento del papel (`receipt-data.ts`), con un QR que abre su factura en el
 * celular. No se imprime por el navegador; el servidor le envia este comprobante al
 * correo en cuanto se aprueba el pago.
 */
export function ReceiptScreen({ doc }: { doc: ReceiptDocument }) {
  const [qr, setQr] = useState<string | null>(null);
  const qrUrl = doc.qrUrl;

  useEffect(() => {
    if (!qrUrl) return;
    let vigente = true;
    // El SVG sale de un enlace nuestro: no hay HTML ajeno que inyectar.
    QRCode.toString(qrUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (vigente) setQr(svg);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [qrUrl]);

  return (
    <section
      aria-label="Comprobante de pago"
      className="receipt-in mt-6 max-h-[50dvh] overflow-y-auto rounded-2xl bg-[var(--surface-raised)] text-left ring-1 ring-[var(--line-subtle)] kland:mt-4 kland:max-h-[58dvh]"
    >
      <header className="border-b border-dashed border-white/12 px-5 py-4 text-center">
        <p className="text-[15px] font-semibold text-ink-50">{doc.title}</p>
        {doc.headerLines.map((linea, index) => (
          <p key={`${index}-${linea}`} className="text-xs leading-relaxed text-[var(--text-muted)]">
            {linea}
          </p>
        ))}
      </header>

      <div className="flex items-end justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {doc.heading}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{doc.issuedAt}</p>
        </div>
        <p className="tnum text-3xl font-bold tracking-tight text-ink-50">{doc.total}</p>
      </div>

      <div className="grid gap-5 border-t border-[var(--line-subtle)] px-5 py-4 sm:grid-cols-2 kland:grid-cols-3">
        {doc.sections.map((seccion) => (
          <div key={seccion.title} className="min-w-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {seccion.title}
            </p>
            <dl className="space-y-1 text-sm">
              {seccion.rows.map((fila) => (
                <div key={fila.label} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-[var(--text-muted)]">{fila.label}</dt>
                  <dd className="min-w-0 break-words text-right font-medium text-ink-100">
                    {fila.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {qr ? (
        <div className="flex items-center gap-4 border-t border-[var(--line-subtle)] px-5 py-4">
          <div
            className="h-24 w-24 shrink-0 rounded-lg bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            Escanea con la camara de tu celular para ver tu factura electronica.
          </p>
        </div>
      ) : null}
    </section>
  );
}
