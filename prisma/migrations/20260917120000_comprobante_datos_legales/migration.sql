-- Datos legales del comprobante. Solo columnas nuevas: no cambia ningun dato existente.
ALTER TABLE "parking_lots"
  ADD COLUMN "insurer" TEXT,
  ADD COLUMN "insurancePolicy" TEXT,
  ADD COLUMN "businessHours" TEXT,
  ADD COLUMN "receiptCounter" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "payments" ADD COLUMN "receiptSeq" INTEGER;

-- Un consecutivo no se repite dentro del mismo parqueadero.
CREATE UNIQUE INDEX "payments_parkingLotId_receiptSeq_key" ON "payments"("parkingLotId", "receiptSeq");
