'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { ReceiptDocument } from '@/lib/printing/receipt-data';

/**
 * El documento viene de `receipt-data.ts`, que se escribe en ASCII porque lo
 * mismo sale por la impresora termica, que no imprime tildes. En pantalla si se
 * pueden: estas son las palabras de ese documento que las llevan. Solo palabras
 * completas, para no tocar placas, codigos ni nombres.
 */
const TILDES: Record<string, string> = {
  Vehiculo: 'Vehículo',
  Telefono: 'Teléfono',
  Direccion: 'Dirección',
  Autorizacion: 'Autorización',
  Codigo: 'Código',
  Regimen: 'Régimen',
  Poliza: 'Póliza',
  Numero: 'Número',
  Electronica: 'Electrónica',
  electronica: 'electrónica',
  datafono: 'datáfono',
  Datafono: 'Datáfono',
  dias: 'días',
  Atencion: 'Atención',
  atencion: 'atención',
};

function conTildes(texto: string): string {
  return texto.replace(/[A-Za-z]+/g, (palabra) => TILDES[palabra] ?? palabra);
}

/**
 * Comprobante de pago en la pantalla del kiosco.
 *
 * Es lo que ve el cliente cuando el kiosco no tiene impresora (o no respondió):
 * el mismo documento del papel (`receipt-data.ts`), con un QR que abre su factura
 * en el celular. No se imprime por el navegador; el servidor le envía este
 * comprobante al correo en cuanto se aprueba el pago.
 *
 * Se lee de pie y a medio metro, como el resto del kiosco: una sola columna, a
 * tamaño de kiosco (todo en `rem`, que crece con la pantalla) y sin rótulos en
 * versalitas. Los títulos de cada bloque son el nombre del bloque, nada más.
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
      className="receipt-in rounded-[1.4rem] bg-[var(--surface-raised)] text-left shadow-[var(--shadow-card)] ring-1 ring-[var(--line-subtle)]"
    >
      <header className="border-b border-dashed border-[var(--line-strong)] px-7 py-5 text-center kland:px-5 kland:py-3">
        <p className="text-xl font-semibold text-[var(--text-primary)]">{conTildes(doc.title)}</p>
        {doc.headerLines.map((linea, index) => (
          <p key={`${index}-${linea}`} className="text-base leading-snug text-[var(--text-muted)]">
            {conTildes(linea)}
          </p>
        ))}
      </header>

      <div className="flex items-end justify-between gap-6 px-7 py-5 kland:px-5 kland:py-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-[var(--text-primary)]">
            {conTildes(doc.heading)}
            {doc.number ? <span className="tnum ml-2 text-[var(--text-secondary)]">{doc.number}</span> : null}
          </p>
          <p className="tnum text-base text-[var(--text-secondary)]">{doc.issuedAt}</p>
        </div>
        <p className="tnum text-[2.2rem] font-bold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
          {doc.total}
        </p>
      </div>

      <div className="divide-y divide-[var(--line-subtle)] border-t border-[var(--line-subtle)] px-7 kland:px-5">
        {doc.sections.map((seccion) => (
          <div key={seccion.title} className="py-4 kland:py-3">
            <p className="mb-1.5 text-lg font-semibold text-[var(--text-primary)]">{conTildes(seccion.title)}</p>
            <dl className="space-y-1">
              {seccion.rows.map((fila) => (
                <div key={fila.label} className="flex items-baseline justify-between gap-6 text-lg kshort:text-sm">
                  <dt className="shrink-0 text-[var(--text-secondary)]">{conTildes(fila.label)}</dt>
                  <dd className="tnum min-w-0 break-words text-right font-semibold text-[var(--text-primary)]">
                    {conTildes(fila.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {qr ? (
        <div className="flex items-center gap-5 border-t border-[var(--line-subtle)] px-7 py-5 kland:px-5">
          <div
            className="h-32 w-32 shrink-0 rounded-xl bg-white p-2 ring-1 ring-[var(--line-subtle)] [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="text-lg leading-snug text-[var(--text-secondary)]">
            Escanea con la cámara de tu celular para ver tu factura electrónica.
          </p>
        </div>
      ) : null}
    </section>
  );
}
