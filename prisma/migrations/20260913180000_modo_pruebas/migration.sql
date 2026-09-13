-- Modo de pruebas por parqueadero: el sistema del parqueadero se simula dentro de la web.
-- Es una columna de una tabla existente: la tabla ya tiene RLS activo (20260913120000_rls_supabase).
ALTER TABLE "parking_lots" ADD COLUMN "testMode" BOOLEAN NOT NULL DEFAULT false;
