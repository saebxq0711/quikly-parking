'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PaymentDTO } from '@/lib/payments/serialize';
import {
  comprobante,
  type ReceiptDocument,
  type ReceiptIssuer,
} from '@/lib/printing/receipt-data';

/**
 * Papel del kiosco impreso por el navegador, en termico de 80 mm y blanco y negro.
 *
 * Pinta el mismo documento que sale por USB (`receipt-data.ts`). En pantalla no se ve:
 * solo aparece al imprimir (reglas `print-receipt` en `globals.css`).
 */
export function PaperReceipt({
  doc,
  onReady,
}: {
  doc: ReceiptDocument;
  /** Avisa cuando el QR ya esta dibujado: imprimir antes lo dejaria en blanco. */
  onReady: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const qrUrl = doc.qrUrl;

  useEffect(() => {
    let vigente = true;

    if (!qrUrl) {
      onReady();
      return;
    }

    // El SVG lo genera la libreria a partir de un enlace nuestro: no hay HTML
    // ajeno que inyectar.
    QRCode.toString(qrUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (vigente) setQr(svg);
      })
      .catch(() => {
        // Sin QR el papel sigue siendo util: se imprime igual.
        if (vigente) onReady();
      });

    return () => {
      vigente = false;
    };
  }, [qrUrl, onReady]);

  // Se avisa despues de que el QR quedo en el DOM, no al generarlo.
  useEffect(() => {
    if (qr) onReady();
  }, [qr, onReady]);

  return (
    <div className="print-receipt" aria-hidden="true">
      <p className="receipt-title">{doc.title}</p>
      {doc.headerLines.map((linea, index) => (
        <p key={`${index}-${linea}`} className="receipt-center">
          {linea}
        </p>
      ))}

      <div className="receipt-rule" />

      <p className="receipt-heading">{doc.heading}</p>
      {doc.number ? <p className="receipt-center receipt-strong">{doc.number}</p> : null}
      <p className="receipt-center">{doc.issuedAt}</p>

      {doc.sections.map((seccion) => (
        <div key={seccion.title}>
          <div className="receipt-rule" />
          <p className="receipt-section">{seccion.title}</p>
          {seccion.rows.map((fila) => (
            <div key={fila.label} className="receipt-row">
              <span>{fila.label}</span>
              <span>{fila.value}</span>
            </div>
          ))}
        </div>
      ))}

      {doc.items.length > 0 ? (
        <>
          <div className="receipt-rule" />
          {doc.items.map((item, index) => (
            <div key={index} className="receipt-item">
              <p>{item.description}</p>
              <div className="receipt-row">
                <span>{item.detail}</span>
                <span>{item.total}</span>
              </div>
            </div>
          ))}
        </>
      ) : null}

      <div className="receipt-rule" />

      {doc.totals.map((fila) => (
        <div key={fila.label} className="receipt-row">
          <span>{fila.label}</span>
          <span>{fila.value}</span>
        </div>
      ))}
      <div className="receipt-total">
        <span>TOTAL</span>
        <span>{doc.total}</span>
      </div>

      {doc.cufe ? (
        <>
          <p className="receipt-fine-label">CUFE</p>
          <p className="receipt-fine">{doc.cufe}</p>
        </>
      ) : null}

      {qr ? (
        <>
          <div className="receipt-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          {doc.qrCaption ? <p className="receipt-note">{doc.qrCaption}</p> : null}
        </>
      ) : null}

      {doc.notes.map((nota) => (
        <p key={nota} className="receipt-note">
          {nota}
        </p>
      ))}
    </div>
  );
}

/**
 * Comprobante de pago.
 *
 * NO es la factura electronica: sale cuando SIIGO no la emite a tiempo, con lo que el
 * cliente necesita para reclamar y un QR que abre su factura en cuanto este lista.
 */
export function Receipt({
  payment,
  issuer,
  onReady,
}: {
  payment: PaymentDTO;
  issuer: ReceiptIssuer;
  onReady: () => void;
}) {
  return <PaperReceipt doc={comprobante(payment, issuer)} onReady={onReady} />;
}
