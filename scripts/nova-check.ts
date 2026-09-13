/**
 * Comprueba el enlace con el sistema del parqueadero, de punta a punta.
 *
 * Uso:  npx tsx scripts/nova-check.ts [slug]      (por defecto: 122)
 *
 * Recorre las tres rutas que necesitamos, con los casos de prueba que nos dio
 * Nova Parking, y NO cobra nada: solo consulta. La confirmacion de pago no se
 * ejercita aqui a proposito — libera un vehiculo de verdad y hay que coordinarla
 * con ellos.
 *
 * Sirve para saber si el enlace esta vivo antes de ponerse a depurar la
 * pantalla, y para volver a verificarlo cuando el sistema se mude a la maquina
 * de produccion (ahi cambian el token y los ids de prueba).
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { novaClientFor, getVehicleRules } from '../src/lib/parking/config';
import { AppError } from '../src/lib/errors';

const db = new PrismaClient();

/**
 * Casos que nos entrego Nova Parking. Cambian al migrar de maquina.
 *
 * Moto, bici y patineta van por CODIGO desde el 2026-09-11 (`A7B48`), no por el
 * numero de tiquete: el numero era su id autoincremental y, siendo secuencial,
 * permitia deducir el de otro vehiculo.
 */
const CASOS = [
  { tipo: 'CAR' as const, termino: 'HKM872', descripcion: 'carro por placa' },
  { tipo: 'MOTORCYCLE' as const, termino: 'R7M57', descripcion: 'moto por codigo' },
  { tipo: 'BICYCLE' as const, termino: 'C1X94', descripcion: 'bicicleta por codigo' },
  { tipo: 'BICYCLE' as const, termino: 'c1-x94', descripcion: 'el mismo, en minusculas y con guion' },
];

function motivo(error: unknown): string {
  if (error instanceof AppError) {
    const detail = error.detail as { status?: number } | undefined;
    return detail?.status
      ? `${error.publicMessage} (HTTP ${detail.status})`
      : error.publicMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const slug = process.argv[2] ?? '122';

  const lot = await db.parkingLot.findUnique({ where: { slug } });
  if (!lot) throw new Error(`No existe el parqueadero "${slug}".`);

  console.log(`\nParqueadero : ${lot.name}`);
  console.log(`Sistema     : ${lot.novaBaseUrl ?? 'SIN CONFIGURAR'}\n`);

  const client = await novaClientFor(lot.id);
  const rules = await getVehicleRules(lot.id);

  /* ------------------------------------------------------- 1. Salud ------ */
  const health = await client.health();
  console.log(`Enlace       ${health.ok ? 'OK' : 'FALLO'}  ${health.detail}`);
  if (!health.ok) {
    console.log(
      '\nSi ves un 530 o "error code 1033", el tunel esta caido: apunta al PC\n' +
        'de desarrollo de Nova Parking y tiene que estar encendido.\n',
    );
    return;
  }

  /* ------------------------------------------- 2. Busqueda y monto ------- */
  for (const caso of CASOS) {
    const rule = rules.find((r) => r.vehicleType === caso.tipo);
    if (!rule) continue;

    const ruta =
      `find-ticket/${rule.searchSegment}/?term=${caso.termino}` +
      `${rule.searchQuery ? `&${rule.searchQuery}` : ''}&exact=true`;

    console.log(`\n${caso.descripcion}  →  ${ruta}`);

    try {
      const ticket = await client.findTicket(
        rule.searchSegment,
        caso.termino,
        rule.searchQuery,
      );

      if (!ticket) {
        console.log('  no encontrado (puede que ya no este adentro)');
        continue;
      }

      console.log(
        `  codigo ${ticket.code ?? '—'}` +
          `${ticket.plate ? ` · placa ${ticket.plate}` : ' · sin placa'}` +
          `${ticket.entryAt ? ` · ingreso ${ticket.entryAt}` : ''}`,
      );

      const checkout = await client.getCheckout(ticket.id);
      if (checkout.alreadyPaid) {
        console.log(
          `  YA PAGADO${checkout.minutesLeft !== null && checkout.minutesLeft !== undefined ? ` · le quedan ${checkout.minutesLeft} min para salir` : ''}`,
        );
      } else {
        console.log(
          `  a cobrar $${checkout.amount.toLocaleString('es-CO')}` +
            `${checkout.ticket.minutes !== null ? ` · ${checkout.ticket.minutes} min` : ''}`,
        );
      }
    } catch (error) {
      console.log(`  FALLO: ${motivo(error)}`);
    }
  }

  /* ------------------------------- 3. Que la busqueda sea exacta --------- */
  const bike = rules.find((r) => r.vehicleType === 'BICYCLE');
  if (bike) {
    console.log('\nComprobando que la busqueda sea EXACTA y no por prefijo...');
    try {
      // "C1" es prefijo del codigo C1X94. Sin `exact=true` la busqueda es por
      // prefijo y devolveria ese u otro, y cobrarle al vehiculo equivocado no
      // tiene vuelta atras.
      const suelto = await client.findTicket(bike.searchSegment, 'C1', bike.searchQuery);
      console.log(
        suelto
          ? `  ATENCION: "C1" devolvio el codigo ${suelto.code}. La busqueda NO es exacta.`
          : '  OK: "C1" no devuelve nada. La busqueda es exacta.',
      );
    } catch (error) {
      console.log(`  no se pudo comprobar: ${motivo(error)}`);
    }
  }

  /*
    La confirmacion no se ejercita nunca aqui, ni siquiera contra la copia
    local: marca el tiquete como salido y lo deja fuera de las siguientes
    corridas. Que sea reversible (`db.sqlite3.original`) no la vuelve inocua
    contra el sistema real, y una comprobacion no deberia portarse distinto
    segun a donde apunte.
  */
  const local = /localhost|127\.0\.0\.1/.test(lot.novaBaseUrl ?? '');
  console.log('\nListo. La confirmacion de pago no se prueba aqui: marca el');
  console.log('tiquete como salido.');
  console.log(
    local
      ? 'Contra la copia local se puede probar aparte y volver atras con\ndb.sqlite3.original (ver nova-parking-local/LEEME.md).\n'
      : 'Estas contra el sistema REAL: libera un vehiculo de verdad y hay que\ncoordinarla con Nova Parking.\n',
  );
}

main()
  .catch((error) => {
    console.error(`\nFALLO: ${motivo(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
