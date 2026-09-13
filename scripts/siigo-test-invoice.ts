/**
 * Envia una factura de prueba a SIIGO usando EXACTAMENTE el mismo codigo que
 * usa la aplicacion (`buildInvoicePayload` + `SiigoClient`), con la
 * configuracion ya guardada en la base de datos.
 *
 * Uso:  npx tsx scripts/siigo-test-invoice.ts [monto]
 *
 * Sirve para comprobar que la configuracion descubierta es valida ANTES de
 * activar la facturacion en produccion, sin tener que simular un cobro
 * completo. No toca ningun pago real: arma un pago de prueba en memoria.
 */

import 'dotenv/config';
import { PrismaClient, type Payment } from '@prisma/client';
import { buildInvoicePayload, findMissingSettings } from '../src/integrations/siigo/invoice-payload';
import { siigoClientFor } from '../src/lib/parking/siigo';
import { getSiigoSettings } from '../src/lib/parking/siigo';

const db = new PrismaClient();

async function main() {
  const amount = Number(process.argv[2] ?? 9500);

  const lot = await db.parkingLot.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!lot) throw new Error('No hay parqueaderos. Ejecutar npm run db:seed primero.');

  const settings = await getSiigoSettings(lot.id);
  const missing = findMissingSettings(settings);
  if (missing.length > 0) {
    throw new Error(
      `Configuracion incompleta. Falta: ${missing.join(', ')}.\n` +
        'Ejecutar: npx tsx scripts/siigo-setup.ts --apply',
    );
  }

  console.log('Configuracion en uso:');
  console.log(`  document.id    ${settings.documentId}`);
  console.log(`  seller         ${settings.sellerId}`);
  console.log(`  payments[].id  ${settings.paymentTypeId}`);
  console.log(`  items[].code   ${settings.itemCode}`);
  console.log(`  monto          ${amount}\n`);

  // Pago de prueba en memoria: no se escribe nada en la base de datos.
  const fake = {
    id: 'test-invoice',
    amount,
    plate: 'ABC123',
    vehicleIdentifier: 'ABC123',
    externalTicketId: '9001',
    customerName: null,
    customerDocument: null,
    createdAt: new Date(),
    resolvedAt: new Date(),
  } as unknown as Payment;

  const payload = buildInvoicePayload(fake, settings, lot);
  console.log('Payload enviado:\n', JSON.stringify(payload, null, 1), '\n');

  const client = await siigoClientFor(lot.id);
  const result = await client.createInvoice(payload);

  console.log('FACTURA CREADA');
  console.log(`  id      ${result.id}`);
  console.log(`  numero  ${result.number}`);
  console.log(`  cufe    ${result.cufe ?? '(sin cufe)'}`);
  console.log(`  url     ${result.publicUrl ?? '(sin url)'}`);

  const raw = result.raw as Record<string, unknown>;
  console.log(`  total   ${JSON.stringify(raw.total)}`);
  console.log(`  items   ${JSON.stringify(raw.items)}`);
}

main()
  .catch((error) => {
    console.error(`\nFALLO: ${error.message ?? error}\n`);
    if (error.detail) console.error(JSON.stringify(error.detail, null, 1));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
