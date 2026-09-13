import { NextResponse } from 'next/server';

/**
 * Manejo de errores con dos caras (CLAUDE.md seccion 22):
 *  - `publicMessage`: lo unico que ve el usuario final. En espanol, sin detalle tecnico.
 *  - `cause` / `detail`: queda solo en los logs del servidor.
 *
 * Nunca se devuelve al navegador una direccion IP, un puerto, un stack trace ni
 * el texto crudo de un error de red.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Debes iniciar sesion para continuar.',
  FORBIDDEN: 'No tienes permisos para realizar esta accion.',
  NOT_FOUND: 'No encontramos lo que buscabas.',
  VALIDATION: 'Revisa los datos ingresados.',
  CONFLICT: 'La operacion ya fue procesada.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  UPSTREAM_UNAVAILABLE:
    'No fue posible consultar la informacion en este momento. Intenta nuevamente.',
  UPSTREAM_TIMEOUT:
    'El sistema del parqueadero esta tardando en responder. Intenta nuevamente.',
  INTERNAL: 'Ocurrio un error inesperado. Intenta nuevamente.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly detail?: unknown;

  constructor(
    code: ErrorCode,
    options: { publicMessage?: string; detail?: unknown; cause?: unknown } = {},
  ) {
    // El `message` es el tecnico: va a los logs, no al navegador.
    super(options.publicMessage ?? DEFAULT_MESSAGE[code], {
      cause: options.cause,
    });
    this.name = 'AppError';
    this.code = code;
    this.publicMessage = options.publicMessage ?? DEFAULT_MESSAGE[code];
    this.detail = options.detail;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

/** Claves cuyo valor jamas debe llegar a un log ni a la auditoria. */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'clave',
  'secret',
  'token',
  'accesskey',
  'authorization',
  'apikey',
  'api_key',
  'cookie',
  'pan',
  'cvv',
];

/**
 * Elimina secretos de un objeto antes de guardarlo en logs o auditoria.
 * Recorre en profundidad y reemplaza el valor por `[REDACTED]`.
 */
export function scrubSecrets<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => scrubSecrets(v, depth + 1)) as unknown as T;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))
        ? '[REDACTED]'
        : scrubSecrets(v, depth + 1);
    }
    return out as unknown as T;
  }

  return value;
}

/**
 * Convierte cualquier error en una respuesta JSON segura y lo registra
 * completo del lado del servidor.
 */
export function toErrorResponse(error: unknown, context?: string) {
  if (error instanceof AppError) {
    // Los errores esperados (validacion, permisos) no ensucian los logs como fallos.
    if (error.status >= 500) {
      console.error(`[${context ?? 'app'}] ${error.code}`, {
        detail: scrubSecrets(error.detail),
        cause: error.cause,
      });
    }
    return NextResponse.json(
      { error: { code: error.code, message: error.publicMessage } },
      { status: error.status },
    );
  }

  console.error(`[${context ?? 'app'}] error no controlado`, error);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: DEFAULT_MESSAGE.INTERNAL } },
    { status: 500 },
  );
}
