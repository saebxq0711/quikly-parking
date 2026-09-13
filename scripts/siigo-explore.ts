/**
 * Explora el ambiente de SIIGO para descubrir los valores reales de los
 * catalogos que la factura necesita (tipo de comprobante, vendedor, forma de
 * pago, producto) en vez de inventarlos.
 *
 * Uso:  npx tsx scripts/siigo-explore.ts
 *
 * Lee SIIGO_USERNAME / SIIGO_ACCESS_KEY del .env. No escribe nada en SIIGO:
 * solo consulta. Es la herramienta que se usa cuando cambian las credenciales
 * o se pasa a produccion, para volver a leer los ids correctos.
 */

import 'dotenv/config';

const BASE = process.env.SIIGO_API_URL ?? 'https://api.siigo.com';
const PARTNER = process.env.SIIGO_PARTNER_ID ?? 'punto-de-pago-parking';

async function auth(): Promise<string> {
  const response = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Partner-Id': PARTNER },
    body: JSON.stringify({
      username: process.env.SIIGO_USERNAME,
      access_key: process.env.SIIGO_ACCESS_KEY,
    }),
  });
  if (!response.ok) {
    throw new Error(`auth ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function get(token: string, path: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Partner-Id': PARTNER,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    return { __error: response.status, body: text.slice(0, 400) };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text.slice(0, 400) };
  }
}

function show(title: string, value: unknown, limit = 2500): void {
  console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);
  const text = JSON.stringify(value, null, 1);
  console.log(text.length > limit ? `${text.slice(0, limit)}\n...(recortado)` : text);
}

async function main() {
  const token = await auth();
  console.log('Autenticado en SIIGO.');

  const documentTypes = (await get(token, '/v1/document-types?type=FV')) as
    | Record<string, unknown>[]
    | Record<string, unknown>;
  show(
    'TIPOS DE COMPROBANTE DE VENTA (document.id)',
    Array.isArray(documentTypes)
      ? documentTypes.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          electronic_type: d.electronic_type,
          active: d.active,
        }))
      : documentTypes,
  );

  const paymentTypes = (await get(token, '/v1/payment-types?document_type=FV')) as
    | Record<string, unknown>[]
    | Record<string, unknown>;
  show(
    'FORMAS DE PAGO (payments[].id)',
    Array.isArray(paymentTypes)
      ? paymentTypes.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          active: p.active,
        }))
      : paymentTypes,
  );

  const users = (await get(token, '/v1/users')) as
    | Record<string, unknown>[]
    | Record<string, unknown>;
  show(
    'VENDEDORES (seller)',
    Array.isArray(users)
      ? users.map((u) => ({
          id: u.id,
          username: u.username,
          identification: u.identification,
          active: u.active,
        }))
      : users,
  );

  const taxes = await get(token, '/v1/taxes');
  show('IMPUESTOS DISPONIBLES', taxes, 1500);

  const products = (await get(token, '/v1/products?page_size=25')) as {
    results?: Record<string, unknown>[];
  };
  show(
    'PRODUCTOS / SERVICIOS (items[].code)',
    products.results
      ? products.results.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          type: p.type,
          taxes: (p.taxes as { name: string }[] | undefined)?.map((t) => t.name),
        }))
      : products,
    3000,
  );

  const accountGroups = await get(token, '/v1/account-groups');
  show('GRUPOS DE INVENTARIO (para crear un producto)', accountGroups, 1200);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
