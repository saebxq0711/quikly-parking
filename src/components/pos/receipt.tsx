'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatCOP } from '@/components/ui';
import type { PaymentDTO } from '@/lib/payments/serialize';

/**
 * Comprobante de pago para la impresora de recibos del kiosco.
 *
 * NO es la factura electronica. La factura la emite SIIGO un rato despues del
 * cobro, y hacer esperar al cliente frente a la barrera por ella no tiene
 * sentido. Este papel sale al instante con lo que el cliente necesita para
 * reclamar, y un QR que abre su factura en cuanto este lista.
 *
 * En pantalla no se ve: solo aparece al imprimir (reglas `print-receipt` en
 * `globals.css`). Esta pensado para papel termico de 80 mm, en blanco y negro.
 */

const VEHICULO: Record<string, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  SCOOTER: 'Patineta',
};

export function Receipt({
  payment,
  parkingLotName,
  onReady,
}: {
  payment: PaymentDTO;
  parkingLotName: string;
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

    // El SVG lo genera la libreria a partir de un enlace nuestro: no hay HTML
    // ajeno que inyectar.
    QRCode.toString(payment.receiptUrl, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
    })
      .then((svg) => {
        if (!vigente) return;
        setQr(svg);
      })
      .catch(() => {
        // Sin QR el comprobante sigue siendo util: se imprime igual.
        if (vigente) onReady();
      });

    return () => {
      vigente = false;
    };
  }, [payment.receiptUrl, onReady]);

  // Se avisa despues de que el QR quedo en el DOM, no al generarlo.
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
  }).format(new Date(payment.resolvedAt ?? payment.createdAt));

  const filas: [string, string | null][] = [
    ['Fecha', fecha],
    ['Vehiculo', VEHICULO[payment.vehicleType] ?? payment.vehicleType],
    [payment.plate ? 'Placa' : 'Codigo', payment.plate ?? payment.vehicleIdentifier],
    [
      'Tarjeta',
      payment.cardBrand
        ? `${payment.cardBrand}${payment.cardMask ? ` ${payment.cardMask}` : ''}`
        : null,
    ],
    ['Autorizacion', payment.authorizationCode],
    ['Recibo', payment.receiptNumber],
  ];

  return (
    <div className="print-receipt" aria-hidden="true">
      <p className="receipt-title">{parkingLotName}</p>
      <p className="receipt-subtitle">Comprobante de pago</p>

      <div className="receipt-rule" />

      {filas
        .filter((fila): fila is [string, string] => Boolean(fila[1]))
        .map(([etiqueta, valor]) => (
          <div key={etiqueta} className="receipt-row">
            <span>{etiqueta}</span>
            <span>{valor}</span>
          </div>
        ))}

      <div className="receipt-rule" />

      <div className="receipt-total">
        <span>TOTAL</span>
        <span>{formatCOP(payment.amount)}</span>
      </div>

      {qr ? (
        <>
          <div className="receipt-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="receipt-note">Escanea para ver tu factura electronica</p>
        </>
      ) : null}

      <p className="receipt-note">
        Este papel es tu comprobante de pago. La factura electronica llega a tu correo.
      </p>
    </div>
  );
}
