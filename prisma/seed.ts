import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { encryptSecret } from '../src/lib/crypto/secrets';

/**
 * Datos iniciales de la plataforma.
 *
 * Crea exactamente lo que el sistema necesita para operar: un super
 * administrador, un parqueadero, su punto de pago y un usuario para cada rol.
 * Nada mas — no hay datos de demostracion ni parqueaderos de ejemplo.
 *
 * Es idempotente: se puede correr varias veces sin duplicar nada.
 *
 * La conexion con el sistema del parqueadero (URL del tunel y token) NO se
 * siembra: se configura desde la administracion, porque es propia de cada sitio
 * y la entrega quien opera ese sistema.
 */

const db = new PrismaClient();

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const SEED = {
  parkingSlug: process.env.SEED_PARKING_SLUG ?? '122',
  parkingName: process.env.SEED_PARKING_NAME ?? 'Parqueadero 122',
  parkingCity: process.env.SEED_PARKING_CITY ?? '',

  superadminEmail: process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@puntodepago.co',
  superadminPassword: process.env.SEED_SUPERADMIN_PASSWORD ?? claveAlAzar(),

  adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@parqueadero122.co',
  adminPassword: process.env.SEED_ADMIN_PASSWORD ?? claveAlAzar(),

  posEmail: process.env.SEED_POS_EMAIL ?? 'caja@parqueadero122.co',
  posPassword: process.env.SEED_POS_PASSWORD ?? claveAlAzar(),

  pointName: process.env.SEED_POINT_NAME ?? 'Punto de pago',
  pointCode: process.env.SEED_POINT_CODE ?? 'PP1',
};

/*
  El repositorio es publico: aqui no hay contrasenas escritas. Sin las variables SEED_*,
  en la base local de desarrollo se generan al azar y se muestran al terminar; contra
  cualquier otra base (Supabase, produccion) el seed se niega a correr sin ellas.
*/
function claveAlAzar(): string {
  // Cumple validatePasswordStrength: 10+ caracteres, mayusculas, minusculas y numero.
  return `${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}Aa1`;
}
const baseLocal = /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(process.env.DATABASE_URL ?? '');
const sinContrasena = ['SEED_SUPERADMIN_PASSWORD', 'SEED_ADMIN_PASSWORD', 'SEED_POS_PASSWORD'].filter(
  (clave) => !process.env[clave],
);
if (!baseLocal && sinContrasena.length > 0) {
  console.error(
    `Esta base no es local: define ${sinContrasena.join(', ')} antes de correr el seed. ` +
      'Las contrasenas de ejemplo no se usan fuera de desarrollo.',
  );
  process.exit(1);
}

/** Guarda un valor de configuracion de una integracion, cifrado o en claro. */
async function setCredential(params: {
  provider: 'NOVA_PARKING' | 'REDEBAN' | 'SIIGO';
  parkingLotId: string | null;
  /** Kiosco dueno de la credencial (el datafono). Sin el, es del parqueadero. */
  paymentPointId?: string | null;
  key: string;
  value: string;
  secret: boolean;
}) {
  const existing = await db.integrationCredential.findFirst({
    where: {
      provider: params.provider,
      parkingLotId: params.parkingLotId,
      paymentPointId: params.paymentPointId ?? null,
      key: params.key,
    },
  });
  const value = params.secret ? encryptSecret(params.value) : params.value;

  if (existing) {
    await db.integrationCredential.update({
      where: { id: existing.id },
      data: { value, secret: params.secret },
    });
    return;
  }
  await db.integrationCredential.create({
    data: {
      provider: params.provider,
      parkingLotId: params.parkingLotId,
      paymentPointId: params.paymentPointId ?? null,
      key: params.key,
      value,
      secret: params.secret,
    },
  });
}

async function main() {
  /* ------------------------------------------------------- SuperAdmin --- */
  await db.user.upsert({
    where: { email: SEED.superadminEmail },
    update: {},
    create: {
      email: SEED.superadminEmail,
      name: 'Super Administrador',
      passwordHash: await hash(SEED.superadminPassword, ARGON),
      role: 'SUPERADMIN',
      mustChangePassword: true,
    },
  });

  /* ------------------------------------------------------ Parqueadero --- */
  const lot = await db.parkingLot.upsert({
    where: { slug: SEED.parkingSlug },
    update: { name: SEED.parkingName },
    create: {
      slug: SEED.parkingSlug,
      name: SEED.parkingName,
      city: SEED.parkingCity || null,
    },
  });

  /* -------------------------------------------------- Kiosco de pago --- */
  // Un kiosco inicial. Se busca por codigo para no duplicarlo si el seed corre otra vez.
  const point =
    (await db.paymentPoint.findFirst({ where: { parkingLotId: lot.id, code: SEED.pointCode } })) ??
    (await db.paymentPoint.create({
      data: {
        parkingLotId: lot.id,
        name: SEED.pointName,
        code: SEED.pointCode,
        // Viajan en la trama al datafono. Sus credenciales se cargan por kiosco.
        cashierCode: SEED.pointCode,
        boxNumber: SEED.pointCode,
      },
    }));

  /* ---------------------------------------------------------- Usuarios --- */
  await db.user.upsert({
    where: { email: SEED.adminEmail },
    update: { parkingLotId: lot.id },
    create: {
      email: SEED.adminEmail,
      name: `Administrador ${SEED.parkingName}`,
      passwordHash: await hash(SEED.adminPassword, ARGON),
      role: 'ADMIN_PARQUEADERO',
      parkingLotId: lot.id,
      mustChangePassword: true,
    },
  });

  await db.user.upsert({
    where: { email: SEED.posEmail },
    update: { parkingLotId: lot.id, paymentPointId: point.id },
    create: {
      email: SEED.posEmail,
      name: 'Operador punto de pago',
      passwordHash: await hash(SEED.posPassword, ARGON),
      role: 'PUNTO_PAGO',
      parkingLotId: lot.id,
      paymentPointId: point.id,
      mustChangePassword: true,
    },
  });

  /* -------------------------------------------- Conexion del sistema --- */
  // El tunel de este parqueadero. El token lo entrega quien opera ese sistema
  // y se carga desde la administracion.
  await db.parkingLot.update({
    where: { id: lot.id },
    data: {
      novaBaseUrl:
        process.env.SEED_NOVA_BASE_URL ?? 'https://api.parqueadero122.com',
    },
  });
  if (process.env.SEED_NOVA_TOKEN) {
    await setCredential({
      provider: 'NOVA_PARKING',
      parkingLotId: lot.id,
      key: 'platformToken',
      value: process.env.SEED_NOVA_TOKEN,
      secret: true,
    });
  }

  /* ------------------------------------------------- Medio de pago --- */
  // Credenciales de Redeban/SIPConnector del ambiente de pruebas, para que el
  // datafono quede operativo desde el primer arranque. Se reemplazan por las
  // de produccion desde la administracion, sin tocar codigo.
  const redeban: Record<string, { value: string; secret: boolean }> = {
    baseUrl: {
      value: process.env.REDEBAN_BASE_URL ?? 'https://sipconnectortest.azurewebsites.net',
      secret: false,
    },
    codigoUnico: { value: process.env.REDEBAN_CODIGO_UNICO ?? '', secret: false },
    usuario: { value: process.env.REDEBAN_USUARIO ?? '', secret: true },
    clave: { value: process.env.REDEBAN_CLAVE ?? '', secret: true },
    codigoTerminal: {
      value: process.env.REDEBAN_CODIGO_TERMINAL ?? '',
      secret: false,
    },
    red: { value: process.env.REDEBAN_RED ?? '0', secret: false },
  };

  for (const [key, entry] of Object.entries(redeban)) {
    if (!entry.value) continue;
    await setCredential({
      provider: 'REDEBAN',
      parkingLotId: lot.id,
      // El datafono es del kiosco, no del parqueadero.
      paymentPointId: point.id,
      key,
      value: entry.value,
      secret: entry.secret,
    });
  }

  /* --------------------------------------------------- Facturacion --- */
  /*
    Credenciales y catalogos del ambiente de pruebas de SIIGO.

    Los ids NO son inventados: se descubrieron consultando los catalogos reales
    del ambiente y se comprobaron emitiendo facturas de verdad
    (`npx tsx scripts/siigo-probe.ts` los vuelve a verificar).
  */
  const siigo: Record<string, { value: string; secret: boolean }> = {
    baseUrl: { value: 'https://api.siigo.com', secret: false },
    // El Partner-Id NO admite guiones ni puntos: con ellos el servicio responde
    // `invalid_partner_id` en todos los endpoints salvo el de autenticacion.
    partnerId: { value: 'PuntoPagoParking', secret: false },
    username: { value: process.env.SIIGO_USERNAME ?? '', secret: false },
    accessKey: { value: process.env.SIIGO_ACCESS_KEY ?? '', secret: true },
    /*
      Unico comprobante del ambiente de pruebas que acepta facturas por API: se
      probaron los 71 electronicos y todos responden `document_settings`.
      En produccion va el del cliente, con su resolucion DIAN.
    */
    documentId: { value: '27939', secret: false },
    sellerId: { value: '916', secret: false },
    // "Datafono Redeban" — ya existia en el catalogo y es exactamente el medio
    // por el que cobra este kiosco.
    paymentTypeId: { value: '9441', secret: false },
    itemCode: { value: 'PARQUEADERO', secret: false },
    itemDescription: { value: 'Servicio de parqueadero', secret: false },
    defaultCustomerIdType: { value: '13', secret: false },
    // Consumidor final, para quien no se identifica en el kiosco.
    defaultCustomerIdentification: { value: '222222222', secret: false },
    defaultCustomerName: { value: 'Consumidor final', secret: false },
    // El comprobante de pruebas NO es electronico y rechaza el timbre.
    sendStamp: { value: 'false', secret: false },
    sendMail: { value: 'false', secret: false },
    enabled: { value: 'true', secret: false },
  };

  for (const [key, entry] of Object.entries(siigo)) {
    if (!entry.value) continue;
    await setCredential({
      provider: 'SIIGO',
      parkingLotId: lot.id,
      key,
      value: entry.value,
      secret: entry.secret,
    });
  }

  console.log('\n  Datos iniciales listos.\n');
  console.log(`  Parqueadero    ${lot.name}  (/p/${lot.slug})`);
  console.log(`  Punto de pago  ${point.name}  (${point.code})\n`);
  console.log(`  SuperAdmin     ${SEED.superadminEmail}  /  ${SEED.superadminPassword}`);
  console.log(`  Administrador  ${SEED.adminEmail}  /  ${SEED.adminPassword}`);
  console.log(`  Punto de pago  ${SEED.posEmail}  /  ${SEED.posPassword}\n`);
  console.log('  Sistema del parqueadero  https://api.parqueadero122.com');
  console.log('  Datafono                 configurado (ambiente de pruebas)');
  console.log('  Facturacion              configurada (ambiente de pruebas)\n');
  console.log('  Falta, y lo entrega quien opera el sistema del parqueadero:');
  console.log('   - El token de acceso, en Parqueaderos -> ficha del sitio\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
