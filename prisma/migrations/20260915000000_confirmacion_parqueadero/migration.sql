-- Estado del aviso de cobro al sistema del parqueadero.
ALTER TABLE "payments"
  ADD COLUMN "parkingConfirmStatus" TEXT,
  ADD COLUMN "parkingConfirmAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "parkingConfirmedAt" TIMESTAMP(3);

-- Cobros aprobados anteriores: sin motivo de fallo, el parqueadero los registro.
UPDATE "payments"
SET "parkingConfirmStatus" = 'CONFIRMED', "parkingConfirmedAt" = "resolvedAt"
WHERE "status" = 'APPROVED' AND "failureReason" IS NULL;

-- Con motivo de fallo, quedaron sin registrar: se reintentan.
UPDATE "payments"
SET "parkingConfirmStatus" = 'PENDING'
WHERE "status" = 'APPROVED' AND "failureReason" IS NOT NULL;
