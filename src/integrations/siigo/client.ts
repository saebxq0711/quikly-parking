import { AppError, scrubSecrets } from '@/lib/errors';

/**
 * Cliente de SIIGO (facturacion electronica).
 *
 * Referencia: https://siigoapi.docs.apiary.io
 * Credenciales de sandbox entregadas por el cliente (siigo_api.md).
 *
 * AUTENTICACION (confirmada en la documentacion entregada):
 *   POST {SIIGO_API_URL}/auth  { username, access_key }  -> { access_token }
 *   El token se envia luego como `Authorization: Bearer <token>` y SIIGO exige
 *   ademas la cabecera `Partner-Id`.
 *
 * El token se cachea en memoria y se renueva antes de expirar, para no pedir
 * uno nuevo en cada factura.
 */

interface TokenEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenEntry>();

export interface SiigoConfig {
  baseUrl: string;
  username: string;
  accessKey: string;
  partnerId: string;
}

export interface SiigoInvoiceResult {
  id: string | null;
  number: string | null;
  cufe: string | null;
  publicUrl: string | null;
  raw: unknown;
}

export class SiigoClient {
  private readonly config: SiigoConfig;

  constructor(config: SiigoConfig) {
    this.config = config;
  }

  private async getToken(): Promise<string> {
    const cacheKey = `${this.config.baseUrl}|${this.config.username}`;
    const cached = tokenCache.get(cacheKey);
    // Margen de 60s para no usar un token que expira mientras viaja.
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const response = await fetch(`${this.config.baseUrl}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Partner-Id': this.config.partnerId,
      },
      body: JSON.stringify({
        username: this.config.username,
        access_key: this.config.accessKey,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    }).catch((error) => {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage: 'No fue posible conectar con el servicio de facturacion.',
        cause: error,
      });
    });

    if (!response.ok) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage: 'El servicio de facturacion rechazo las credenciales.',
        detail: { status: response.status },
      });
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage: 'El servicio de facturacion no devolvio un token valido.',
      });
    }

    // Si SIIGO no informa expiracion, se asume una vida corta y conservadora.
    const ttlSeconds = data.expires_in ?? 3600;
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return data.access_token;
  }

  /**
   * Peticion autenticada al API. Reintenta una vez ante el limite de
   * peticiones, que el servicio devuelve con frecuencia y que de otro modo
   * abortaria una factura por una razon puramente transitoria.
   */
  private async request<T>(
    path: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
    attempt = 1,
  ): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Partner-Id': this.config.partnerId,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    }).catch((error) => {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage: 'No fue posible conectar con el servicio de facturacion.',
        cause: error,
      });
    });

    if (response.status === 429 && attempt <= 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      return this.request<T>(path, init, attempt + 1);
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }

    if (!response.ok) {
      throw new AppError('UPSTREAM_UNAVAILABLE', {
        publicMessage: 'El servicio de facturacion rechazo la solicitud.',
        detail: { path, status: response.status, body: scrubSecrets(body) },
      });
    }

    return body as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  /** Crea una factura de venta. El payload lo arma `invoice-payload.ts`. */
  async createInvoice(payload: unknown): Promise<SiigoInvoiceResult> {
    const body = await this.request<Record<string, unknown>>('/v1/invoices', {
      method: 'POST',
      body: payload,
    });

    const data = (body ?? {}) as Record<string, unknown>;
    return {
      id: (data.id as string) ?? null,
      number: data.number !== undefined ? String(data.number) : null,
      cufe:
        (data.cufe as string) ??
        ((data.stamp as Record<string, unknown>)?.cufe as string) ??
        null,
      publicUrl: (data.public_url as string) ?? null,
      raw: body,
    };
  }
}
