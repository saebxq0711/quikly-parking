import type { CredentialProvider } from '@prisma/client';
import { db } from './db';
import { decryptSecret, encryptSecret, maskSecret } from './crypto/secrets';

/**
 * Lectura y escritura de credenciales de integraciones.
 *
 * Reglas (CLAUDE.md secciones 13, 14 y 30):
 *  - Los valores marcados como secretos se guardan cifrados (AES-256-GCM).
 *  - `getCredentials` solo se usa desde el servidor.
 *  - `listCredentialsForDisplay` es lo unico que puede llegar al navegador:
 *    devuelve una mascara, nunca el valor real.
 */

export interface CredentialScope {
  provider: CredentialProvider;
  /** null = configuracion global de la plataforma. */
  parkingLotId: string | null;
}

/** Devuelve las credenciales descifradas de un proveedor. Solo servidor. */
export async function getCredentials(
  scope: CredentialScope,
): Promise<Record<string, string>> {
  const rows = await db.integrationCredential.findMany({
    where: { provider: scope.provider, parkingLotId: scope.parkingLotId },
  });

  const result: Record<string, string> = {};
  for (const row of rows) {
    try {
      result[row.key] = row.secret ? decryptSecret(row.value) : row.value;
    } catch (error) {
      // Un secreto que no se puede descifrar casi siempre significa que se
      // cambio CREDENTIALS_ENCRYPTION_KEY. Se omite y se avisa en el log.
      console.error('[credentials] no se pudo descifrar', {
        provider: scope.provider,
        key: row.key,
        error,
      });
    }
  }
  return result;
}

/**
 * Igual que `getCredentials`, pero cae a la configuracion global cuando el
 * parqueadero no tiene un valor propio. Asi el SuperAdmin puede definir una
 * configuracion por defecto y cada parqueadero sobrescribir solo lo suyo.
 */
export async function getEffectiveCredentials(
  provider: CredentialProvider,
  parkingLotId: string,
): Promise<Record<string, string>> {
  const [global, own] = await Promise.all([
    getCredentials({ provider, parkingLotId: null }),
    getCredentials({ provider, parkingLotId }),
  ]);
  return { ...global, ...own };
}

export async function setCredential(params: {
  scope: CredentialScope;
  key: string;
  value: string;
  secret?: boolean;
  updatedById: string;
}): Promise<void> {
  const secret = params.secret ?? true;
  const stored = secret ? encryptSecret(params.value) : params.value;

  // No se usa `upsert`: el indice unico compuesto incluye `parkingLotId`, que es
  // nullable, y en PostgreSQL dos NULL se consideran distintos — el indice no
  // protege las filas globales. Ademas Prisma no admite null en un
  // WhereUniqueInput compuesto. Se resuelve buscando primero, dentro de una
  // transaccion para que dos escrituras simultaneas no creen filas duplicadas.
  await db.$transaction(async (tx) => {
    const existing = await tx.integrationCredential.findFirst({
      where: {
        provider: params.scope.provider,
        parkingLotId: params.scope.parkingLotId,
        key: params.key,
      },
      select: { id: true },
    });

    if (existing) {
      await tx.integrationCredential.update({
        where: { id: existing.id },
        data: { value: stored, secret, updatedById: params.updatedById },
      });
      return;
    }

    await tx.integrationCredential.create({
      data: {
        provider: params.scope.provider,
        parkingLotId: params.scope.parkingLotId,
        key: params.key,
        value: stored,
        secret,
        updatedById: params.updatedById,
      },
    });
  });
}

export async function deleteCredential(
  scope: CredentialScope,
  key: string,
): Promise<void> {
  await db.integrationCredential.deleteMany({
    where: { provider: scope.provider, parkingLotId: scope.parkingLotId, key },
  });
}

export interface CredentialDisplay {
  key: string;
  /** Valor enmascarado si es secreto; valor real si no lo es. */
  display: string;
  secret: boolean;
  updatedAt: Date;
}

/** Version apta para enviar al navegador: los secretos van enmascarados. */
export async function listCredentialsForDisplay(
  scope: CredentialScope,
): Promise<CredentialDisplay[]> {
  const rows = await db.integrationCredential.findMany({
    where: { provider: scope.provider, parkingLotId: scope.parkingLotId },
    orderBy: { key: 'asc' },
  });

  return rows.map((row) => {
    if (!row.secret) {
      return {
        key: row.key,
        display: row.value,
        secret: false,
        updatedAt: row.updatedAt,
      };
    }
    let display = '********';
    try {
      display = maskSecret(decryptSecret(row.value));
    } catch {
      display = '(no se pudo descifrar)';
    }
    return { key: row.key, display, secret: true, updatedAt: row.updatedAt };
  });
}
