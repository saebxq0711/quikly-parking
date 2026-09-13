/**
 * Comprueba las rutas de SOLO LECTURA del panel del administrador.
 *
 * Uso:  npm run nova:panel [slug]      (por defecto: 122)
 *
 * Es la prueba que se le prometio a Nova Parking en
 * REQUERIMIENTOS_PANEL_ADMIN.md seccion 6. Verifica dos cosas distintas:
 *
 *   1. Que cada consulta responde.
 *   2. Que un POST a esas mismas rutas es RECHAZADO.
 *
 * Lo segundo importa tanto como lo primero: el panel se presento como de solo
 * lectura, y esa promesa tiene que ser cierta del lado del servidor, no solo
 * porque nuestra interfaz no tenga botones.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../src/lib/crypto/secrets';

const db = new PrismaClient();

const RUTAS = [
  ['Cifras del resumen', '/api/parking/dashboard/'],
  ['Vehiculos adentro', '/api/reports/vehicles-in-parking/'],
  ['Historial de tiquetes', '/api/parking/ticket/?page=1'],
  ['Detalle de un tiquete', '/api/parking/ticket/32/'],
  ['Volcado para exportar', '/api/parking/ticket/export/'],
  ['Catalogo de vehiculos', '/api/parking/vehicleType/'],
  ['Cajas', '/api/pos/'],
  ['Movimientos de una caja', '/api/pos/1/'],
  ['Reporte diario', '/api/reports/daily/'],
  ['Reporte mensual', '/api/reports/monthly/'],
  // Estos dos exigen rango; sin el devuelven 400 y pareceria que fallan.
  ['Reporte consolidado', '/api/reports/consolidated/?from_date=2026-09-01&to_date=2026-09-12'],
  ['Transacciones detalladas', '/api/reports/detailed-transactions/?from_date=2026-09-01&to_date=2026-09-12'],
] as const;

async function main() {
  const slug = process.argv[2] ?? '122';
  const lot = await db.parkingLot.findUniqueOrThrow({ where: { slug } });
  if (!lot.novaBaseUrl) throw new Error('Este parqueadero no tiene URL configurada.');

  const cred = await db.integrationCredential.findFirst({
    where: { provider: 'NOVA_PARKING', parkingLotId: lot.id, key: 'platformToken' },
  });
  const token = cred ? decryptSecret(cred.value) : '';
  const base = lot.novaBaseUrl.replace(/\/+$/, '');

  console.log(`\nParqueadero : ${lot.name}`);
  console.log(`Sistema     : ${base}\n`);

  const pedir = (ruta: string, metodo: 'GET' | 'POST') =>
    fetch(base + ruta, {
      method: metodo,
      headers: { 'X-Platform-Token': token, 'Content-Type': 'application/json' },
      body: metodo === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(20_000),
    })
      .then((r) => r.status)
      .catch(() => 0);

  let leen = 0;
  let protegidas = 0;

  console.log('CONSULTA                      LECTURA        ESCRITURA BLOQUEADA');
  console.log('-'.repeat(68));

  for (const [nombre, ruta] of RUTAS) {
    const get = await pedir(ruta, 'GET');
    const post = await pedir(ruta.split('?')[0], 'POST');

    const lectura = get === 200 ? 'OK' : get === 0 ? 'sin respuesta' : `HTTP ${get}`;
    // Cualquier cosa menos un 2xx significa que la escritura no paso. Un 405 es
    // la respuesta ideal; un 403 tambien sirve.
    const bloqueada = post < 200 || post >= 300;

    if (get === 200) leen += 1;
    if (bloqueada) protegidas += 1;

    console.log(
      `${nombre.padEnd(29)} ${lectura.padEnd(14)} ${bloqueada ? `si (HTTP ${post})` : `NO — HTTP ${post}`}`,
    );
  }

  console.log('-'.repeat(68));
  console.log(`Consultas que responden : ${leen} de ${RUTAS.length}`);
  console.log(`Escrituras bloqueadas   : ${protegidas} de ${RUTAS.length}`);

  if (protegidas < RUTAS.length) {
    console.log(
      '\nATENCION: alguna ruta acepta POST desde afuera. Falta el decorador de\n' +
        'solo lectura (REQUERIMIENTOS_PANEL_ADMIN.md seccion 2).',
    );
  }
  console.log();
}

main()
  .catch((e) => {
    console.error('\nFALLO:', e instanceof Error ? e.message : e, '\n');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
