'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatCOP } from '@/components/ui';
import type { InvoiceDocumentDTO } from '@/lib/billing/invoice-print';
import type { PaymentDTO } from '@/lib/payments/serialize';

/**
 * La factura de SIIGO impresa en el kiosco, en papel termico de 80 mm.
 *
 * Es la representacion de la factura real: numero, items, impuestos y total salen
 * de lo que SIIGO devolvio al emitirla. El QR abre la factura en linea (el mismo
 * enlace del comprobante, que redirige al documento de SIIGO), y el CUFE aparece
 * cuando la DIAN ya la valido.
 *
 * Como el comprobante, no se ve en pantalla: solo al imprimir (`print-receipt`).
 */
export function InvoiceTicket({
  invoice,
  payment,
  onReady,
}: {
  invoice: InvoiceDocumentDTO;
  payment: PaymentDTO;
  /** Avisa cuando el QR ya esta dibujado: imprimir antes lo dejaria en blanco. */
  onReady: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    if (!payment.receiptUrl) {
      onReady();
      return;
    }

    QRCode.toString(payment.receiptUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (vigente) setQr(svg);
      })
      .catch(() => {
        if (vigente) onReady();
      });

    return () => {
      vigente = false;
    };
  }, [payment.receiptUrl, onReady]);

  useEffect(() => {
    if (qr) onReady();
  }, [qr, onReady]);

  const fecha = new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).format(new Date(invoice.issuedAt));

  const emisor = [
    invoice.issuerNit ? `NIT ${invoice.issuerNit}` : null,
    invoice.issuerAddress,
    invoice.issuerCity,
  ].filter(Boolean);

  return (
    <div className="print-receipt" aria-hidden="true">
      <p className="receipt-title">{invoice.issuerName}</p>
      {emisor.map((linea) => (
        <p key={linea} className="receipt-center">
          {linea}
        </p>
      ))}

      <div className="receipt-rule" />

      <p className="receipt-heading">
        {invoice.electronic ? 'Factura electronica de venta' : 'Factura de venta'}
      </p>
      <p className="receipt-center receipt-strong">No. {invoice.number}</p>
      <p className="receipt-center">{fecha}</p>

      <div className="receipt-rule" />

      <div className="receipt-row">
        <span>Cliente</span>
        <span>{invoice.customerName}</span>
      </div>
      {invoice.customerDocument ? (
        <div className="receipt-row">
          <span>Documento</span>
          <span>{invoice.customerDocument}</span>
        </div>
      ) : null}
      <div className="receipt-row">
        <span>{payment.plate ? 'Placa' : 'Codigo'}</span>
        <span>{payment.plate ?? payment.vehicleIdentifier}</span>
      </div>

      <div className="receipt-rule" />

      {invoice.lines.map((linea, index) => (
        <div key={index} className="receipt-item">
          <p>{linea.description}</p>
          <div className="receipt-row">
            <span>
              {linea.quantity} x {formatCOP(linea.unitPrice)}
            </span>
            <span>{formatCOP(linea.total)}</span>
          </div>
        </div>
      ))}

      <div className="receipt-rule" />

      {invoice.taxes.length > 0 ? (
        <>
          <div className="receipt-row">
            <span>Subtotal</span>
            <span>{formatCOP(invoice.subtotal)}</span>
          </div>
          {invoice.taxes.map((tax) => (
            <div key={`${tax.name}-${tax.percentage}`} className="receipt-row">
              <span>
                {tax.name}
                {tax.percentage !== null ? ` ${tax.percentage}%` : ''}
              </span>
              <span>{formatCOP(tax.value)}</span>
            </div>
          ))}
        </>
      ) : null}

      <div className="receipt-total">
        <span>TOTAL</span>
        <span>{formatCOP(invoice.total)}</span>
      </div>

      <div className="receipt-rule" />

      {invoice.paymentMethod ? (
        <div className="receipt-row">
          <span>Forma de pago</span>
          <span>{invoice.paymentMethod}</span>
        </div>
      ) : null}
      {payment.cardBrand ? (
        <div className="receipt-row">
          <span>Tarjeta</span>
          <span>
            {payment.cardBrand}
            {payment.cardMask ? ` ${payment.cardMask}` : ''}
          </span>
        </div>
      ) : null}
      {payment.authorizationCode ? (
        <div className="receipt-row">
          <span>Autorizacion</span>
          <span>{payment.authorizationCode}</span>
        </div>
      ) : null}

      {invoice.cufe ? (
        <>
          <p className="receipt-fine-label">CUFE</p>
          <p className="receipt-fine">{invoice.cufe}</p>
        </>
      ) : null}

      {qr ? (
        <>
          <div className="receipt-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="receipt-note">Escanea para ver tu factura en linea</p>
        </>
      ) : null}

      {invoice.customerEmail ? (
        <p className="receipt-note">Tambien la enviamos a {invoice.customerEmail}</p>
      ) : null}
      <p className="receipt-note">Gracias por tu visita</p>
    </div>
  );
}
