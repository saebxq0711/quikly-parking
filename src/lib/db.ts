import { PrismaClient } from '@prisma/client';
import { isProduction } from './env';

/**
 * Cliente Prisma unico. En desarrollo se guarda en `globalThis` para que el
 * hot-reload de Next no abra una conexion nueva en cada recompilacion.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
  });

if (!isProduction) globalForPrisma.prisma = db;
