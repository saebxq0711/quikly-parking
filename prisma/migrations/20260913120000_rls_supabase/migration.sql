-- Row Level Security en todas las tablas (Supabase).
--
-- Supabase publica el esquema `public` por su API REST (PostgREST) con los roles `anon` y
-- `authenticated`. Sin RLS, cualquiera con la clave publica del proyecto podria leer o
-- escribir usuarios, pagos y credenciales cifradas. Esta aplicacion NO usa esa API: entra
-- por Prisma con el usuario dueño de las tablas, que no esta sujeto a RLS. Asi que se
-- activa RLS SIN politicas (nadie mas entra) y ademas se quitan los permisos de esos roles.
--
-- En una base PostgreSQL normal (desarrollo local) no hace nada malo: el dueño de las
-- tablas sigue teniendo acceso completo, y los roles de Supabase no existen.
--
-- IMPORTANTE para migraciones futuras: toda tabla NUEVA debe llevar su
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en la misma migracion.

DO $$
DECLARE
  tabla record;
BEGIN
  FOR tabla IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla.tablename);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
  END IF;
END $$;
