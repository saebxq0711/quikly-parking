-- Marca del envio del comprobante al correo del cliente.
ALTER TABLE "payments" ADD COLUMN "receiptEmailedAt" TIMESTAMP(3);
