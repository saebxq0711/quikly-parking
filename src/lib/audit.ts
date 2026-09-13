import type { Prisma } from '@prisma/client';
import { db } from './db';
import { scrubSecrets } from './errors';

/**
 * Registro de auditoria (CLAUDE.md seccion 24).
 *
 * Los metadatos pasan por `scrubSecrets` antes de guardarse: ninguna
 * contrasena, token o clave de integracion puede terminar en esta tabla.
 *
 * Escribir auditoria nunca debe tumbar la operacion que se esta auditando:
 * si el insert falla, se registra en consola y el flujo continua.
 */

export const AuditAction = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',
  PARKING_LOT_CREATED: 'PARKING_LOT_CREATED',
  PARKING_LOT_UPDATED: 'PARKING_LOT_UPDATED',
  PAYMENT_POINT_CREATED: 'PAYMENT_POINT_CREATED',
  PAYMENT_POINT_UPDATED: 'PAYMENT_POINT_UPDATED',
  CREDENTIAL_UPDATED: 'CREDENTIAL_UPDATED',
  VEHICLE_SEARCH: 'VEHICLE_SEARCH',
  PAYMENT_START: 'PAYMENT_START',
  PAYMENT_RESULT: 'PAYMENT_RESULT',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  INVOICE_REQUESTED: 'INVOICE_REQUESTED',
  INVOICE_RESULT: 'INVOICE_RESULT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditInput {
  action: AuditActionName;
  actorId?: string | null;
  parkingLotId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        parkingLotId: input.parkingLotId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata
          ? (scrubSecrets(input.metadata) as Prisma.InputJsonValue)
          : undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] no se pudo registrar el evento', {
      action: input.action,
      error,
    });
  }
}

/** Extrae IP y user-agent de una peticion, para adjuntarlos a la auditoria. */
export function requestContext(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const forwarded = request.headers.get('x-forwarded-for');
  return {
    ip: forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  };
}
