/**
 * Averigua empiricamente que necesita SIIGO para aceptar una factura.
 *
 * Uso:  npx tsx scripts/siigo-probe.ts
 *
 * El catalogo lista muchos tipos de comprobante y formas de pago, pero solo
 * algunos estan habilitados para facturar por API, y el servicio solo lo dice al
 * intentarlo. Este probe recorre los candidatos y reporta cual funciona, en vez
 * de dejar que se descubra con una factura fallida en produccion.
 *
 * Tambien comprueba el endpoint de clientes, que es el que usa el kiosco para
 * reconocer a alguien por su numero de documento.
 */

import 'dotenv/config';

const BASE = process.env.SIIGO_API_URL ?? 'https://api.siigo.com';
const PARTNER = process.env.SIIGO_PARTNER_ID ?? 'PuntoPagoParking';

let token = '';

async function auth() {
  const response = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Partner-Id': PARTNER },
    body: JSON.stringify({
      username: process.env.SIIGO_USERNAME,
      access_key: process.env.SIIGO_ACCESS_KEY,
    }),
  });
  if (!response.ok) throw new Error(`auth ${response.status}`);
  token = ((await response.json()) as { access_token: string }).access_token;
}

/** Reintenta ante el limite de peticiones, que el sandbox devuelve a menudo. */
async function call(
  path: string,
  init: RequestInit = {},
  attempt = 1,
): Promise<{ status: number; body: unknown; text: string }> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Partner-Id': PARTNER,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (response.status === 429 && attempt <= 6) {
    await new Promise((r) => setTimeout(r, 1800 * attempt));
    return call(path, init, attempt + 1);
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

function firstError(body: unknown): string {
  const errors = (body as { Errors?: { Message?: string; Params?: string[] }[] })
    ?.Errors;
  if (!Array.isArray(errors) || errors.length === 0) return '';
  return errors
    .map((e) => (e.Params?.length ? `${e.Message} [${e.Params.join(', ')}]` : e.Message))
    .join(' | ');
}

const today = () => new Date().toISOString().slice(0, 10);

interface Candidate {
  documentId: number;
  paymentTypeId: number;
  sellerId: number;
  itemCode: string;
}

function invoicePayload(c: Candidate, stamp: boolean) {
  return {
    document: { id: c.documentId },
    date: today(),
    customer: {
      person_type: 'Person',
      id_type: '13',
      identification: '222222222',
      branch_office: 0,
      name: ['Consumidor', 'Final'],
    },
    seller: c.sellerId,
    stamp: { send: stamp },
    mail: { send: false },
    observations: 'Sondeo de configuracion',
    items: [
      {
        code: c.itemCode,
        description: 'Servicio de parqueadero',
        quantity: 1,
        price: 5000,
        discount: 0,
      },
    ],
    payments: [{ id: c.paymentTypeId, value: 5000, due_date: today() }],
  };
}

async function main() {
  await auth();
  console.log('Autenticado en SIIGO.\n');

  /* ------------------------------------------------ 1. Clientes ---------- */
  console.log('='.repeat(66));
  console.log('CLIENTES — busqueda por numero de documento');
  console.log('='.repeat(66));

  const byId = await call('/v1/customers?identification=222222222');
  console.log(`GET /v1/customers?identification=  -> ${byId.status}`);
  if (byId.status === 200) {
    const results = (byId.body as { results?: unknown[] })?.results ?? [];
    console.log(`  encontrados: ${results.length}`);
    if (results[0]) {
      const c = results[0] as Record<string, unknown>;
      console.log(
        `  ejemplo: id=${c.id} identification=${c.identification} name=${JSON.stringify(c.name)}`,
      );
      console.log(`  campos: ${Object.keys(c).join(', ')}`);
    }
  } else {
    console.log(`  ${firstError(byId.body) || byId.text.slice(0, 160)}`);
  }

  /* ------------------------------------- 2. Vendedores y productos ------- */
  const users = await call('/v1/users');
  const sellers = ((users.body as { results?: { id: number; username: string; active: boolean }[] })?.results ?? [])
    .filter((u) => u.active)
    .slice(0, 4);
  console.log(`\nVendedores activos: ${sellers.map((s) => `${s.id}(${s.username})`).join(', ')}`);

  const product = await call('/v1/products?code=PARQUEADERO');
  const item = ((product.body as { results?: { code: string }[] })?.results ?? [])[0];
  console.log(`Producto de parqueadero: ${item ? item.code : 'NO EXISTE'}`);
  if (!item) {
    console.log('  Crear primero con: npx tsx scripts/siigo-setup.ts --apply');
    return;
  }

  /* ----------------------------------------- 3. Formas de pago ----------- */
  const paymentTypes = await call('/v1/payment-types?document_type=FV');
  const payments = ((paymentTypes.body as { id: number; name: string; active: boolean }[]) ?? [])
    .filter((p) => p.active);
  const preferred = payments.filter((p) =>
    /datafono|tarjeta|efectivo|contado/i.test(p.name),
  );
  console.log(`\nFormas de pago activas: ${payments.length} (candidatas: ${preferred.length})`);

  /* --------------------------- 4. Probar combinaciones de comprobante ---- */
  console.log(`\n${'='.repeat(66)}`);
  console.log('COMPROBANTES — cual acepta realmente una factura por API');
  console.log('='.repeat(66));

  const docs = ((await call('/v1/document-types?type=FV')).body as {
    id: number;
    code: string;
    name: string;
    active: boolean;
    electronic_type: string;
  }[]) ?? [];

  const candidates = docs.filter((d) => d.active);
  const seller = sellers[0]?.id ?? 916;
  const payment = preferred[0] ?? payments[0];

  console.log(`Probando con vendedor ${seller} y forma de pago ${payment?.id} (${payment?.name})\n`);

  const working: { doc: (typeof docs)[number]; stamp: boolean }[] = [];

  for (const doc of candidates) {
    // Un comprobante electronico exige timbre; uno no electronico lo rechaza.
    const stamp = doc.electronic_type === 'ElectronicInvoice';
    const result = await call('/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(
        invoicePayload(
          { documentId: doc.id, paymentTypeId: payment.id, sellerId: seller, itemCode: item.code },
          stamp,
        ),
      ),
    });

    if (result.status === 201 || result.status === 200) {
      const created = result.body as { id: string; number: number; total: number };
      console.log(
        `OK   id=${doc.id} code=${doc.code} "${doc.name}" (${doc.electronic_type}) stamp=${stamp}`,
      );
      console.log(`     -> factura ${created.number} total=${created.total} ${created.id}`);
      working.push({ doc, stamp });
      if (working.length >= 2) break;
      continue;
    }

    const message = firstError(result.body);
    // Si fallo por el timbre, se reintenta con el valor contrario.
    if (/stamp/i.test(message)) {
      const retry = await call('/v1/invoices', {
        method: 'POST',
        body: JSON.stringify(
          invoicePayload(
            { documentId: doc.id, paymentTypeId: payment.id, sellerId: seller, itemCode: item.code },
            !stamp,
          ),
        ),
      });
      if (retry.status === 201 || retry.status === 200) {
        const created = retry.body as { id: string; number: number; total: number };
        console.log(
          `OK   id=${doc.id} code=${doc.code} "${doc.name}" (${doc.electronic_type}) stamp=${!stamp}`,
        );
        console.log(`     -> factura ${created.number} total=${created.total}`);
        working.push({ doc, stamp: !stamp });
        if (working.length >= 2) break;
        continue;
      }
    }
  }

  console.log(`\n${'='.repeat(66)}`);
  if (working.length === 0) {
    console.log('Ningun comprobante del ambiente acepto una factura.');
  } else {
    const best =
      working.find((w) => w.doc.electronic_type === 'ElectronicInvoice') ?? working[0];
    console.log('CONFIGURACION QUE FUNCIONA');
    console.log(`  documentId    ${best.doc.id}   (${best.doc.name})`);
    console.log(`  electronico   ${best.doc.electronic_type}`);
    console.log(`  sendStamp     ${best.stamp}`);
    console.log(`  sellerId      ${seller}`);
    console.log(`  paymentTypeId ${payment.id}   (${payment.name})`);
    console.log(`  itemCode      ${item.code}`);
  }
  console.log('='.repeat(66));
}

main().catch((error) => {
  console.error(`\nFALLO: ${error.message ?? error}\n`);
  process.exit(1);
});
