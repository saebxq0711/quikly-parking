-- Seguridad: limitador de peticiones compartido, IPs bloqueadas y eventos.
-- Solo agrega tablas: no toca ningun dato existente.

CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "rate_limit_buckets_resetAt_idx" ON "rate_limit_buckets"("resetAt");

CREATE TABLE "blocked_ips" (
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "offenses" INTEGER NOT NULL DEFAULT 1,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blocked_ips_pkey" PRIMARY KEY ("ip")
);
CREATE INDEX "blocked_ips_blockedUntil_idx" ON "blocked_ips"("blockedUntil");

CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "kind" TEXT NOT NULL,
    "path" TEXT,
    "detail" TEXT,
    "userId" TEXT,
    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_events_createdAt_idx" ON "security_events"("createdAt");
CREATE INDEX "security_events_ip_createdAt_idx" ON "security_events"("ip", "createdAt");

-- Igual que el resto (migracion 20260913120000_rls_supabase): RLS sin politicas y
-- sin permisos para los roles de la API publica de Supabase. La app entra por
-- Prisma con el dueño de las tablas, que no esta sujeto a RLS.
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_ips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "rate_limit_buckets", "blocked_ips", "security_events" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "rate_limit_buckets", "blocked_ips", "security_events" FROM authenticated';
  END IF;
END $$;
