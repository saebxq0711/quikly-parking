-- Varios kioscos de pago por parqueadero, cada uno con su propio datafono.

-- Ya no hay un solo punto de pago por parqueadero.
DROP INDEX "payment_points_parkingLotId_key";
CREATE INDEX "payment_points_parkingLotId_idx" ON "payment_points"("parkingLotId");

-- Las credenciales del datafono pasan a ser de cada kiosco.
ALTER TABLE "integration_credentials" ADD COLUMN "paymentPointId" TEXT;
ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_paymentPointId_fkey"
  FOREIGN KEY ("paymentPointId") REFERENCES "payment_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "integration_credentials_provider_parkingLotId_key_key";
CREATE UNIQUE INDEX "integration_credentials_scope_key"
  ON "integration_credentials"("provider", "parkingLotId", "paymentPointId", "key");

-- El datafono que ya estaba configurado queda en el kiosco que ya existia (habia uno
-- por parqueadero, asi que la asignacion no es ambigua).
UPDATE "integration_credentials" AS ic
SET "paymentPointId" = pp."id"
FROM "payment_points" AS pp
WHERE ic."provider" = 'REDEBAN'
  AND ic."parkingLotId" = pp."parkingLotId";
