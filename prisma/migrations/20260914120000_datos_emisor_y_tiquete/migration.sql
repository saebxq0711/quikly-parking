-- Datos del emisor para el comprobante impreso, y datos del ingreso en cada pago.
ALTER TABLE "parking_lots"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "taxRegime" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT;

ALTER TABLE "payments"
  ADD COLUMN "ticketCode" TEXT,
  ADD COLUMN "entryAt" TIMESTAMP(3),
  ADD COLUMN "stayMinutes" INTEGER;
