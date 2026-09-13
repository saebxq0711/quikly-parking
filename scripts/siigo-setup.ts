/**
 * Deja SIIGO listo para facturar el servicio de parqueadero.
 *
 * Uso:  npx tsx scripts/siigo-setup.ts             (muestra lo que haria)
 *       npx tsx scripts/siigo-setup.ts --apply     (crea el producto y guarda)
 *
 * Que hace:
 *  1. Descubre en los catalogos REALES del ambiente el tipo de comprobante
 *     electronico, el vendedor y la forma de pago.
 *  2. Busca el producto del servicio de parqueadero por su codigo; si no
 *     existe, lo crea.
 *  3. Guarda todo como configuracion de la plataforma.
 *
 * Por que existe: el payload de ejemplo que vino con las credenciales es de un
 * kiosco de comida, asi que sus ids no sirven. Esto los reemplaza por los del
 * ambiente real, sin adivinar ninguno.
 *
 * IMPORTANTE sobre el IVA: el producto se crea con IVA 19% *incluido en el
 * precio* (`tax_included: true`). Es deliberado: el valor a facturar es el que
 * devuelve el sistema del parqueadero y que ya se le cobro al cliente en el
 * datafono, asi que el total de la factura debe ser EXACTAMENTE ese. Con el
 * impuesto incluido, SIIGO desagrega el IVA por dentro y el total no cambia.
 * El tratamiento tributario del servicio debe confirmarlo el contador del
 * cliente; se puede cambiar sin tocar codigo desde /admin/integraciones.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SIIGO_API_URL ?? 'https://api.siigo.com';
const PARTNER = process.env.SIIGO_PARTNER_ID ?? 'PuntoPagoParking';

/** Codigo con el que identificamos el servicio de parqueadero en SIIGO. */
const PRODUCT_CODE = 'PARQUEADERO';
const PRODUCT_NAME = 'Servicio de parqueadero';

interface DocumentType {
  id: number;
  code: string;
  name: string;
  electronic_type: string;
  active: boolean;
}
interface PaymentType {
  id: number;
  name: string;
  type: string;
  active: boolean;
}
interface Paged<T> {
  pagination?: { total_results: number };
  results: T[];
}
interface SiigoUser {
  id: number;
  username: string;
  active: boolean;
}
interface Product {
  id: string;
  code: string;
  name: string;
  taxes?: { id: number; name: string; percentage: number }[];
}

let token = '';

async function auth(): Promise<void> {
  const response = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Partner-Id': PARTNER },
    body: JSON.stringify({
      username: process.env.SIIGO_USERNAME,
      access_key: process.env.SIIGO_ACCESS_KEY,
    }),
  });
  if (!response.ok) throw new Error(`auth ${response.status}: ${await response.text()}`);
  token = ((await response.json()) as { access_token: string }).access_token;
}

/**
 * Peticion con reintento ante el limite de peticiones del ambiente.
 * El sandbox de SIIGO responde 429 con frecuencia; sin esto el script falla a
 * mitad de camino y deja la configuracion incompleta.
 */
async function call<T>(
  path: string,
  init: RequestInit = {},
  attempt = 1,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Partner-Id': PARTNER,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 429 && attempt <= 5) {
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return call<T>(path, init, attempt + 1);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

function pickBest<T>(
  items: T[],
  name: (item: T) => string,
  positive: string[],
  negative: string[] = [],
): T | undefined {
  return items
    .map((item) => {
      const lower = name(item).toLowerCase();
      let points = 0;
      positive.forEach((word, index) => {
        if (lower.includes(word)) points += positive.length - index;
      });
      negative.forEach((word) => {
        if (lower.includes(word)) points -= 4;
      });
      return { item, points };
    })
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)[0]?.item;
}

async function main() {
  const apply = process.argv.includes('--apply');
  await auth();
  console.log('Autenticado en SIIGO.\n');

  /* ------------------------------------------- 1. Tipo de comprobante --- */
  const documentTypes = await call<DocumentType[]>('/v1/document-types?type=FV');
  const electronic = documentTypes.filter(
    (d) => d.active && d.electronic_type === 'ElectronicInvoice',
  );
  const documentType =
    pickBest(electronic, (d) => d.name, ['factura electrónica de venta', 'factura de venta']) ??
    electronic[0];

  /* ------------------------------------------------------ 2. Vendedor --- */
  const users = await call<Paged<SiigoUser>>('/v1/users');
  const seller =
    users.results.find((u) => u.active && u.username === process.env.SIIGO_USERNAME) ??
    users.results.find((u) => u.active);

  /* -------------------------------------------------- 3. Forma de pago --- */
  const paymentTypes = await call<PaymentType[]>('/v1/payment-types?document_type=FV');
  const active = paymentTypes.filter((p) => p.active);
  // El cobro de esta plataforma siempre sale por el datafono Redeban.
  const paymentType =
    pickBest(active, (p) => p.name, ['datafono redeban', 'datafono', 'tarjeta'], [
      'prueba',
      'qa',
      'test',
      'raise',
      'devolucion',
    ]) ?? active.find((p) => /efectivo|contado/i.test(p.name));

  /* -------------------------------------- 4. Producto del parqueadero --- */
  const found = await call<Paged<Product>>(
    `/v1/products?code=${encodeURIComponent(PRODUCT_CODE)}`,
  );
  let product = found.results[0];

  console.log('Valores tomados de los catalogos reales del ambiente:\n');
  console.log(`  document.id     ${documentType?.id}  (${documentType?.name})`);
  console.log(`  seller          ${seller?.id}  (${seller?.username})`);
  console.log(`  payments[].id   ${paymentType?.id}  (${paymentType?.name})`);
  console.log(
    `  items[].code    ${product?.code ?? PRODUCT_CODE}  (${product ? product.name : 'NO EXISTE — se creara'})`,
  );

  if (!documentType || !seller || !paymentType) {
    throw new Error('No se pudo determinar alguno de los catalogos obligatorios.');
  }

  if (!apply) {
    console.log('\nNada se creo ni se guardo. Ejecutar con --apply para aplicarlo.\n');
    return;
  }

  if (!product) {
    console.log(`\nCreando el producto "${PRODUCT_NAME}" (${PRODUCT_CODE})...`);
    product = await call<Product>('/v1/products', {
      method: 'POST',
      body: JSON.stringify({
        code: PRODUCT_CODE,
        name: PRODUCT_NAME,
        // "Servicios": un parqueadero presta un servicio, no vende inventario.
        account_group: 1501,
        type: 'Service',
        stock_control: false,
        active: true,
        tax_classification: 'Taxed',
        // Ver la nota de IVA en la cabecera de este archivo.
        tax_included: true,
        taxes: [{ id: 1270 }],
        unit: { code: '94', name: 'unidad' },
        description: 'Cobro por permanencia en parqueadero.',
      }),
    });
    console.log(`Producto creado: ${product.code} (${product.id})`);
  }

  /* --------------------------------------------------- 5. Persistir --- */
  const db = new PrismaClient();

  // Ids de catalogo: NO son secretos, se guardan en claro para que el
  // SuperAdmin pueda verificarlos de un vistazo en la interfaz.
  const settings: Record<string, string> = {
    documentId: String(documentType.id),
    sellerId: String(seller.id),
    paymentTypeId: String(paymentType.id),
    itemCode: product.code,
    itemDescription: PRODUCT_NAME,
    // "13" = Cedula de ciudadania. "222222222" es la identificacion de
    // consumidor final usada en Colombia cuando el cliente no se identifica.
    defaultCustomerIdType: '13',
    defaultCustomerIdentification: '222222222',
    defaultCustomerName: 'Consumidor final',
    sendStamp: 'true',
    sendMail: 'false',
  };

  for (const [key, value] of Object.entries(settings)) {
    const existing = await db.integrationCredential.findFirst({
      where: { provider: 'SIIGO', parkingLotId: null, key },
    });
    if (existing) {
      await db.integrationCredential.update({
        where: { id: existing.id },
        data: { value, secret: false },
      });
    } else {
      await db.integrationCredential.create({
        data: { provider: 'SIIGO', parkingLotId: null, key, value, secret: false },
      });
    }
  }

  await db.$disconnect();
  console.log('\nConfiguracion de SIIGO guardada. La facturacion ya puede activarse.\n');
}

main().catch((error) => {
  console.error(`\n${error.message ?? error}\n`);
  process.exit(1);
});
