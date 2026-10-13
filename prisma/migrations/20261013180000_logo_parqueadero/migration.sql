-- Logo de cada parqueadero (panel y kiosco). Solo agrega: no toca ningun dato existente.

ALTER TABLE "parking_lots" ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);

CREATE TABLE "parking_lot_logos" (
    "parkingLotId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_lot_logos_pkey" PRIMARY KEY ("parkingLotId")
);

ALTER TABLE "parking_lot_logos" ADD CONSTRAINT "parking_lot_logos_parkingLotId_fkey" FOREIGN KEY ("parkingLotId") REFERENCES "parking_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Igual que el resto (migracion 20260913120000_rls_supabase): RLS sin politicas y
-- sin permisos para los roles de la API publica de Supabase. La app entra por
-- Prisma con el dueño de las tablas, que no esta sujeto a RLS.
ALTER TABLE "parking_lot_logos" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "parking_lot_logos" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "parking_lot_logos" FROM authenticated';
  END IF;
END $$;
