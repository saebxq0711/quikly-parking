'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/guards';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';
import { AuditAction, recordAudit } from '@/lib/audit';
import { getCredentials, setCredential } from '@/lib/credentials';
import { novaClientFor } from '@/lib/parking/config';
import { testRedebanConnection } from '@/lib/parking/redeban';
import {
  getSiigoSettings,
  isSiigoCredentialError,
  siigoClientFor,
  verifySiigoConfig,
} from '@/lib/parking/siigo';
import { SiigoClient } from '@/integrations/siigo/client';
import { blockIp, unblockIp } from '@/lib/security/blocklist';
import { normalizeIp } from '@/lib/security/ip';

/**
 * Acciones administrativas.
 *
 * Cada una revalida el rol por su cuenta: una accion de servidor es un endpoint
 * publico, y confiar en que el layout ya filtro seria confiar en el cliente
 * (CLAUDE.md secciones 10 y 11).
 *
 * Todas devuelven `{ ok, message }` en vez de lanzar, para que el formulario
 * muestre un mensaje claro sin exponer detalle tecnico.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Dato que la pantalla debe mostrar una unica vez (una contrasena nueva). */
  secret?: string;
}

const ok = (message: string, secret?: string): ActionResult => ({
  ok: true,
  message,
  secret,
});
const fail = (message: string): ActionResult => ({ ok: false, message });

/* ------------------------------------------------------------ Parqueadero */

const parkingLotSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').max(120),
  slug: z
    .string()
    .min(1, 'El identificador es obligatorio')
    .max(40)
    .regex(
      /^[a-z0-9-]+$/,
      'El identificador solo admite minusculas, numeros y guiones.',
    ),
  /*
    Datos del emisor. Son obligatorios porque encabezan el comprobante y la factura
    que se imprimen en el kiosco: un papel sin NIT ni direccion no sirve de soporte.
  */
  legalName: z
    .string()
    .min(3, 'Escribe la razon social tal como aparece en el RUT.')
    .max(160),
  nit: z
    .string()
    .regex(/^\d{6,10}-\d$/, 'El NIT va con su digito de verificacion, asi: 900123456-7.'),
  taxRegime: z.enum(['Responsable de IVA', 'No responsable de IVA'], {
    message: 'Elige el regimen de IVA.',
  }),
  address: z.string().min(5, 'Escribe la direccion del parqueadero.').max(160),
  city: z.string().min(2, 'Escribe la ciudad.').max(80),
  department: z.string().min(2, 'Escribe el departamento.').max(80),
  phone: z
    .string()
    .regex(/^[0-9+()\s-]{7,20}$/, 'Escribe un telefono de contacto valido.'),
  email: z
    .string()
    .max(160)
    .refine(
      (valor) => valor === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor),
      'El correo del parqueadero no es valido.',
    ),
  insurer: z.string().min(2, 'Escribe la aseguradora de la poliza de responsabilidad civil.').max(120),
  insurancePolicy: z.string().min(2, 'Escribe el numero de la poliza de responsabilidad civil.').max(60),
  businessHours: z.string().max(120),
});

function parkingLotFields(formData: FormData) {
  const texto = (campo: string) => String(formData.get(campo) ?? '').trim();
  return {
    name: texto('name'),
    slug: texto('slug').toLowerCase(),
    legalName: texto('legalName'),
    // Se acepta con puntos o espacios (900.123.456-7); se guarda limpio.
    nit: texto('nit').replace(/[.\s]/g, ''),
    taxRegime: texto('taxRegime'),
    address: texto('address'),
    city: texto('city'),
    department: texto('department'),
    phone: texto('phone'),
    email: texto('email').toLowerCase(),
    insurer: texto('insurer'),
    insurancePolicy: texto('insurancePolicy'),
    businessHours: texto('businessHours'),
  };
}

function parkingLotData(datos: z.infer<typeof parkingLotSchema>) {
  return {
    name: datos.name,
    slug: datos.slug,
    legalName: datos.legalName,
    nit: datos.nit,
    taxRegime: datos.taxRegime,
    address: datos.address,
    city: datos.city,
    department: datos.department,
    phone: datos.phone,
    email: datos.email || null,
    insurer: datos.insurer,
    insurancePolicy: datos.insurancePolicy,
    businessHours: datos.businessHours || null,
  };
}

export async function createParkingLot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('SUPERADMIN');

  const parsed = parkingLotSchema.safeParse(parkingLotFields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    const lot = await db.parkingLot.create({ data: parkingLotData(parsed.data) });


    await recordAudit({
      action: AuditAction.PARKING_LOT_CREATED,
      actorId: user.id,
      parkingLotId: lot.id,
      entity: 'ParkingLot',
      entityId: lot.id,
      metadata: { name: lot.name, slug: lot.slug },
    });

    revalidatePath('/admin/parqueaderos');
    return ok(`Parqueadero "${lot.name}" creado. Entra a su ficha para agregar sus kioscos de pago.`);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return fail('Ya existe un parqueadero con ese identificador.');
    }
    console.error('[admin] error creando parqueadero', error);
    return fail('No fue posible crear el parqueadero.');
  }
}

const parkingLotUpdateSchema = parkingLotSchema.extend({
  parkingLotId: z.string().min(1),
});

export async function updateParkingLot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('SUPERADMIN');

  const parsed = parkingLotUpdateSchema.safeParse({
    parkingLotId: formData.get('parkingLotId'),
    ...parkingLotFields(formData),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    const lot = await db.parkingLot.update({
      where: { id: parsed.data.parkingLotId },
      data: parkingLotData(parsed.data),
    });

    await recordAudit({
      action: AuditAction.PARKING_LOT_UPDATED,
      actorId: user.id,
      parkingLotId: lot.id,
      entity: 'ParkingLot',
      entityId: lot.id,
    });

    revalidatePath('/admin/parqueaderos');
    return ok('Datos del parqueadero actualizados.');
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return fail('Ya existe un parqueadero con ese identificador.');
    }
    return fail('No fue posible actualizar el parqueadero.');
  }
}

/* --------------------------------------- Conexion con el sistema del sitio */

const connectionSchema = z.object({
  parkingLotId: z.string().min(1),
  novaBaseUrl: z
    .string()
    .url('La URL debe incluir https:// y un dominio valido.')
    .or(z.literal('')),
  platformToken: z.string().max(500).optional(),
});

/**
 * Guarda el dominio del tunel y el token de ESTE parqueadero.
 *
 * Cada parqueadero es un despliegue distinto del sistema de parqueadero, con su
 * propio dominio y su propia llave. Por eso se configura por sitio desde aqui y
 * no en variables de entorno: una sola web atiende a todos, y agregar uno nuevo
 * no puede exigir un despliegue.
 */
export async function updateParkingConnection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const parsed = connectionSchema.safeParse({
    parkingLotId: formData.get('parkingLotId'),
    novaBaseUrl: String(formData.get('novaBaseUrl') ?? '').trim(),
    platformToken: String(formData.get('platformToken') ?? '').trim() || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  await db.parkingLot.update({
    where: { id: parsed.data.parkingLotId },
    data: { novaBaseUrl: parsed.data.novaBaseUrl || null },
  });

  // Un campo de token vacio significa "no lo cambies", no "borralo": asi se
  // puede corregir la URL sin volver a escribir el token.
  if (parsed.data.platformToken) {
    await setCredential({
      scope: { provider: 'NOVA_PARKING', parkingLotId: parsed.data.parkingLotId },
      key: 'platformToken',
      value: parsed.data.platformToken,
      secret: true,
      updatedById: actor.id,
    });
  }

  await recordAudit({
    action: AuditAction.CREDENTIAL_UPDATED,
    actorId: actor.id,
    parkingLotId: parsed.data.parkingLotId,
    entity: 'ParkingLot',
    entityId: parsed.data.parkingLotId,
    metadata: {
      novaBaseUrl: parsed.data.novaBaseUrl || null,
      tokenActualizado: Boolean(parsed.data.platformToken),
    },
  });

  revalidatePath('/admin/parqueaderos');
  return ok('Conexion guardada.');
}

export async function testNovaConnection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole('SUPERADMIN');
  const parkingLotId = String(formData.get('parkingLotId') ?? '');

  try {
    const client = await novaClientFor(parkingLotId);
    const result = await client.health();
    return result.ok ? ok(result.detail) : fail(result.detail);
  } catch (error) {
    return fail(
      error instanceof AppError
        ? error.publicMessage
        : 'No hay una conexion valida configurada para este parqueadero.',
    );
  }
}

/**
 * Modo de pruebas del parqueadero.
 *
 * Encendido, el kiosco usa el sistema del parqueadero SIMULADO (ver
 * `integrations/nova-parking/simulator.ts`) para probar escaner, impresora y datafono
 * sin el tunel. La URL y el token reales no se tocan: al apagarlo vuelven a usarse.
 */
export async function setParkingTestMode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  const parkingLotId = String(formData.get('parkingLotId') ?? '');
  if (!parkingLotId) return fail('Falta el parqueadero.');

  const testMode = formData.get('testMode') !== null;
  await db.parkingLot.update({ where: { id: parkingLotId }, data: { testMode } });

  await recordAudit({
    action: AuditAction.PARKING_LOT_UPDATED,
    actorId: actor.id,
    parkingLotId,
    entity: 'ParkingLot',
    entityId: parkingLotId,
    metadata: { modoPruebas: testMode },
  });

  revalidatePath('/admin/parqueaderos');
  return ok(
    testMode
      ? 'Modo de pruebas activado: el sistema del parqueadero esta simulado.'
      : 'Modo de pruebas apagado: se usa la conexion real con el parqueadero.',
  );
}

/* ------------------------------------------------- Medio de pago (Redeban) */

const redebanSchema = z.object({
  parkingLotId: z.string().min(1),
  paymentPointId: z.string().min(1, 'Falta el kiosco.'),
  baseUrl: z.string().url('La URL del servicio no es valida.'),
  codigoUnico: z
    .string()
    .min(1, 'El codigo unico es obligatorio')
    .max(20)
    .regex(/^\d+$/, 'El codigo unico solo puede tener digitos.'),
  usuario: z.string().min(1, 'El usuario es obligatorio').max(120),
  clave: z.string().max(200).optional(),
  codigoTerminal: z
    .string()
    .min(1, 'El codigo del datafono es obligatorio')
    .max(10),
  red: z.string().max(2),
});

/**
 * Credenciales de SIPConnector de ESTE parqueadero.
 *
 * Cada parqueadero es un comercio distinto ante la red, con su propio codigo
 * unico y su propio datafono. La clave se guarda cifrada y no se vuelve a
 * mostrar.
 *
 * El codigo unico conserva los ceros a la izquierda a proposito: el manual
 * advierte que `0010203040` es valido y `10203040` no.
 */
export async function saveRedebanConfig(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const parsed = redebanSchema.safeParse({
    parkingLotId: formData.get('parkingLotId'),
    paymentPointId: formData.get('paymentPointId'),
    baseUrl: String(formData.get('baseUrl') ?? '').trim(),
    codigoUnico: String(formData.get('codigoUnico') ?? '').trim(),
    usuario: String(formData.get('usuario') ?? '').trim(),
    clave: String(formData.get('clave') ?? '').trim() || undefined,
    codigoTerminal: String(formData.get('codigoTerminal') ?? '').trim().toUpperCase(),
    red: String(formData.get('red') ?? '0'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // El kiosco tiene que ser de ese parqueadero: el id viaja en el formulario.
  const point = await db.paymentPoint.findFirst({
    where: { id: parsed.data.paymentPointId, parkingLotId: parsed.data.parkingLotId },
    select: { id: true },
  });
  if (!point) return fail('Kiosco no encontrado.');

  const scope = {
    provider: 'REDEBAN' as const,
    parkingLotId: parsed.data.parkingLotId,
    paymentPointId: point.id,
  };

  const values: { key: string; value: string; secret: boolean }[] = [
    { key: 'baseUrl', value: parsed.data.baseUrl, secret: false },
    { key: 'codigoUnico', value: parsed.data.codigoUnico, secret: false },
    { key: 'usuario', value: parsed.data.usuario, secret: true },
    { key: 'codigoTerminal', value: parsed.data.codigoTerminal, secret: false },
    { key: 'red', value: parsed.data.red, secret: false },
  ];

  // Igual que el token: vacio significa "conservar la actual".
  if (parsed.data.clave) {
    values.push({ key: 'clave', value: parsed.data.clave, secret: true });
  }

  for (const entry of values) {
    await setCredential({ scope, ...entry, updatedById: actor.id });
  }

  await recordAudit({
    action: AuditAction.CREDENTIAL_UPDATED,
    actorId: actor.id,
    parkingLotId: parsed.data.parkingLotId,
    entity: 'IntegrationCredential',
    metadata: {
      provider: 'REDEBAN',
      claveActualizada: Boolean(parsed.data.clave),
      codigoTerminal: parsed.data.codigoTerminal,
    },
  });

  revalidatePath('/admin/parqueaderos');
  return ok('Datafono del kiosco guardado.');
}

export async function testRedeban(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole('SUPERADMIN');
  const result = await testRedebanConnection(
    String(formData.get('parkingLotId') ?? ''),
    String(formData.get('paymentPointId') ?? ''),
  );
  return result.ok ? ok(result.message) : fail(result.message);
}

/* ---------------------------------------------------- Facturacion (SIIGO) */

const siigoSchema = z.object({
  parkingLotId: z.string().min(1),
  baseUrl: z.string().url('La URL del servicio no es valida.'),
  partnerId: z
    .string()
    .min(1)
    .max(60)
    // El servicio responde `invalid_partner_id` en todos los endpoints salvo
    // el de autenticacion si el valor lleva guiones o puntos.
    .regex(/^[A-Za-z0-9]+$/, 'El Partner-Id solo admite letras y numeros.'),
  enabled: z.string().optional(),
  username: z.string().email('El usuario de SIIGO debe ser un correo.').max(200),
  accessKey: z.string().max(500).optional(),
  documentId: z.string().regex(/^\d+$/, 'El tipo de comprobante debe ser numerico.'),
  sellerId: z.string().regex(/^\d+$/, 'El vendedor debe ser numerico.'),
  paymentTypeId: z.string().regex(/^\d+$/, 'La forma de pago debe ser numerica.'),
  itemCode: z.string().min(1, 'El codigo del servicio es obligatorio.').max(60),
  itemDescription: z.string().max(120).optional(),
  defaultCustomerIdType: z.string().max(4).optional(),
  defaultCustomerIdentification: z.string().max(30).optional(),
  defaultCustomerName: z.string().max(120).optional(),
  sendStamp: z.string().optional(),
  sendMail: z.string().optional(),
});

/**
 * Configuracion de facturacion de ESTE parqueadero.
 *
 * Cada sitio factura con su propia empresa: sus credenciales, su numeracion y
 * su base de clientes. Dos parqueaderos no pueden emitir facturas bajo el mismo
 * NIT, asi que esto no puede ser una configuracion comun.
 */
export async function saveSiigoConfig(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const parsed = siigoSchema.safeParse({
    parkingLotId: formData.get('parkingLotId'),
    baseUrl: String(formData.get('baseUrl') ?? '').trim(),
    partnerId: String(formData.get('partnerId') ?? '').trim(),
    enabled: formData.get('enabled') || undefined,
    username: String(formData.get('username') ?? '').trim(),
    accessKey: String(formData.get('accessKey') ?? '').trim() || undefined,
    documentId: String(formData.get('documentId') ?? '').trim(),
    sellerId: String(formData.get('sellerId') ?? '').trim(),
    paymentTypeId: String(formData.get('paymentTypeId') ?? '').trim(),
    itemCode: String(formData.get('itemCode') ?? '').trim(),
    itemDescription: formData.get('itemDescription') || undefined,
    defaultCustomerIdType: formData.get('defaultCustomerIdType') || undefined,
    defaultCustomerIdentification:
      formData.get('defaultCustomerIdentification') || undefined,
    defaultCustomerName: formData.get('defaultCustomerName') || undefined,
    sendStamp: formData.get('sendStamp') || undefined,
    sendMail: formData.get('sendMail') || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const scope = {
    provider: 'SIIGO' as const,
    parkingLotId: parsed.data.parkingLotId,
  };
  const enabled = parsed.data.enabled === 'on';
  const sendStamp = parsed.data.sendStamp === 'on';

  /*
    Antes de guardar se compara con SIIGO, con las credenciales del formulario (o la
    clave ya guardada si no se escribio una nueva). Con la facturacion activada, una
    configuracion que SIIGO va a rechazar no se guarda: cada cobro quedaria sin
    factura. Si SIIGO no responde, se guarda igual y se avisa.
  */
  const accessKey =
    parsed.data.accessKey ?? (await getCredentials(scope)).accessKey ?? null;
  let aviso: string | null = null;

  if (!accessKey) {
    if (enabled) return fail('Escribe la clave de acceso de SIIGO para activar la facturacion.');
  } else {
    try {
      const problemas = await verifySiigoConfig(
        new SiigoClient({
          baseUrl: parsed.data.baseUrl,
          username: parsed.data.username,
          accessKey,
          partnerId: parsed.data.partnerId,
        }),
        {
          documentId: Number(parsed.data.documentId),
          sellerId: Number(parsed.data.sellerId),
          paymentTypeId: Number(parsed.data.paymentTypeId),
          itemCode: parsed.data.itemCode,
          sendStamp,
        },
      );
      if (problemas.length > 0) {
        if (enabled) return fail(`No se guardo. ${problemas.join(' ')}`);
        aviso = `Antes de activarla corrige: ${problemas.join(' ')}`;
      }
    } catch (error) {
      if (isSiigoCredentialError(error)) {
        if (enabled) {
          return fail(
            'No se guardo: SIIGO rechazo el usuario, la clave de acceso o el identificador de la aplicacion.',
          );
        }
        aviso = 'SIIGO rechazo el usuario o la clave: revisalos antes de activarla.';
      } else {
        aviso = 'No se pudo verificar con SIIGO en este momento; usa "Probar facturacion" mas tarde.';
      }
    }
  }

  const plain: Record<string, string> = {
    baseUrl: parsed.data.baseUrl,
    partnerId: parsed.data.partnerId,
    enabled: enabled ? 'true' : 'false',
    username: parsed.data.username,
    documentId: parsed.data.documentId,
    sellerId: parsed.data.sellerId,
    paymentTypeId: parsed.data.paymentTypeId,
    itemCode: parsed.data.itemCode,
    itemDescription: parsed.data.itemDescription ?? 'Servicio de parqueadero',
    defaultCustomerIdType: parsed.data.defaultCustomerIdType ?? '13',
    defaultCustomerIdentification:
      parsed.data.defaultCustomerIdentification ?? '222222222',
    defaultCustomerName: parsed.data.defaultCustomerName ?? 'Consumidor final',
    sendStamp: sendStamp ? 'true' : 'false',
    sendMail: parsed.data.sendMail === 'on' ? 'true' : 'false',
  };

  for (const [key, value] of Object.entries(plain)) {
    await setCredential({ scope, key, value, secret: false, updatedById: actor.id });
  }
  if (parsed.data.accessKey) {
    await setCredential({
      scope,
      key: 'accessKey',
      value: parsed.data.accessKey,
      secret: true,
      updatedById: actor.id,
    });
  }

  await recordAudit({
    action: AuditAction.CREDENTIAL_UPDATED,
    actorId: actor.id,
    parkingLotId: parsed.data.parkingLotId,
    entity: 'IntegrationCredential',
    metadata: {
      provider: 'SIIGO',
      claveActualizada: Boolean(parsed.data.accessKey),
      activa: parsed.data.enabled === 'on',
    },
  });

  revalidatePath('/admin/parqueaderos');
  revalidatePath('/admin/integraciones');
  return ok(aviso ? `Guardada. ${aviso}` : 'Facturacion configurada y verificada con SIIGO.');
}

/**
 * Comprueba credenciales y configuracion de facturacion contra SIIGO, sin facturar:
 * que el comprobante, el vendedor, la forma de pago y el servicio existan y que el
 * envio a la DIAN corresponda al tipo de comprobante.
 */
export async function testSiigo(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole('SUPERADMIN');
  const parkingLotId = String(formData.get('parkingLotId') ?? '');

  try {
    const client = await siigoClientFor(parkingLotId);
    const settings = await getSiigoSettings(parkingLotId);
    if (
      settings.documentId === null ||
      settings.sellerId === null ||
      settings.paymentTypeId === null ||
      !settings.itemCode
    ) {
      return fail('Completa y guarda la configuracion antes de probarla.');
    }

    const problemas = await verifySiigoConfig(client, {
      documentId: settings.documentId,
      sellerId: settings.sellerId,
      paymentTypeId: settings.paymentTypeId,
      itemCode: settings.itemCode,
      sendStamp: settings.sendStamp,
    });
    return problemas.length === 0
      ? ok('Conectado. El comprobante, el vendedor, la forma de pago y el servicio estan bien en SIIGO.')
      : fail(`Conectado, pero hay que corregir: ${problemas.join(' ')}`);
  } catch (error) {
    return fail(
      error instanceof AppError
        ? error.publicMessage
        : 'No fue posible conectar con la facturacion.',
    );
  }
}

/* ---------------------------------------------------- Punto de pago */

/* ------------------------------------------------------ Kioscos de pago */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Crea un kiosco de pago junto con su usuario de acceso.
 *
 * Cada kiosco es una pantalla distinta, con su datafono y, si la usa, su impresora, y
 * entra con su propio usuario: asi cada cobro queda atribuido al kiosco que lo hizo y
 * su sesion se puede cerrar a distancia sin tocar los demas.
 */
export async function createKiosk(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const parkingLotId = String(formData.get('parkingLotId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (name.length < 2 || name.length > 60) {
    return fail('Ponle un nombre al kiosco, por ejemplo "Salida principal".');
  }
  if (!EMAIL.test(email)) return fail('Escribe el correo con el que entrara este kiosco.');
  if (password !== confirmPassword) return fail('Las dos contrasenas no coinciden.');
  const weak = validatePasswordStrength(password);
  if (weak) return fail(weak);

  const lot = await db.parkingLot.findUnique({
    where: { id: parkingLotId },
    select: { id: true, _count: { select: { paymentPoints: true } } },
  });
  if (!lot) return fail('Parqueadero no encontrado.');

  // Codigo corto que viaja al datafono como cajero y numero de caja (maximo 10).
  const code = `K${lot._count.paymentPoints + 1}`;
  const passwordHash = await hashPassword(password);

  try {
    const point = await db.$transaction(async (tx) => {
      const creado = await tx.paymentPoint.create({
        data: {
          parkingLotId: lot.id,
          name,
          code,
          cashierCode: code,
          boxNumber: code,
          hasPrinter: formData.get('hasPrinter') === 'on',
        },
      });
      await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'PUNTO_PAGO',
          parkingLotId: lot.id,
          paymentPointId: creado.id,
          mustChangePassword: false,
        },
      });
      return creado;
    });

    await recordAudit({
      action: AuditAction.PAYMENT_POINT_UPDATED,
      actorId: actor.id,
      parkingLotId: lot.id,
      entity: 'PaymentPoint',
      entityId: point.id,
      metadata: { creado: true, name, email },
    });

    revalidatePath('/admin/parqueaderos');
    return ok(`Kiosco "${name}" creado. Su pantalla entra con ${email}. Falta configurar su datafono.`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Ya existe un usuario con ese correo.');
    }
    console.error('[admin] error creando kiosco', error);
    return fail('No fue posible crear el kiosco.');
  }
}

/** Nombre, impresora y si esta en servicio. Fuera de servicio, se cierra su sesion. */
export async function updateKiosk(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const paymentPointId = String(formData.get('paymentPointId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) return fail('El nombre del kiosco es obligatorio.');

  const point = await db.paymentPoint.findUnique({
    where: { id: paymentPointId },
    select: { id: true, parkingLotId: true },
  });
  if (!point) return fail('Kiosco no encontrado.');

  // Una casilla sin marcar no viaja en el formulario: ausente es "no".
  const data = {
    name,
    hasPrinter: formData.get('hasPrinter') === 'on',
    active: formData.get('active') === 'on',
  };
  await db.paymentPoint.update({ where: { id: point.id }, data });

  if (!data.active) {
    const usuarios = await db.user.findMany({
      where: { paymentPointId: point.id },
      select: { id: true },
    });
    for (const usuario of usuarios) await revokeAllSessions(usuario.id);
  }

  await recordAudit({
    action: AuditAction.PAYMENT_POINT_UPDATED,
    actorId: actor.id,
    parkingLotId: point.parkingLotId,
    entity: 'PaymentPoint',
    entityId: point.id,
    metadata: data,
  });

  revalidatePath('/admin/parqueaderos');
  return ok(data.active ? 'Kiosco actualizado.' : 'Kiosco fuera de servicio y su sesion cerrada.');
}

/* ----------------------------------------------- Reglas de identificacion */

const ruleSchema = z.object({
  parkingLotId: z.string().min(1),
  vehicleType: z.enum(['CAR', 'MOTORCYCLE', 'BICYCLE', 'SCOOTER']),
  identifierKind: z.enum(['PLATE', 'TICKET_ID', 'CODE']),
  searchSegment: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'El segmento solo admite minusculas, numeros y guiones.'),
  searchQuery: z
    .string()
    .max(120)
    .regex(/^[A-Za-z0-9=&_-]*$/, 'Los parametros solo admiten letras, numeros, = y &.')
    .optional(),
  inputLabel: z.string().max(60).optional(),
  inputPlaceholder: z.string().max(80).optional(),
  enabled: z.string().optional(),
});

export async function updateVehicleRule(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const parsed = ruleSchema.safeParse({
    parkingLotId: formData.get('parkingLotId'),
    vehicleType: formData.get('vehicleType'),
    identifierKind: formData.get('identifierKind'),
    searchSegment: String(formData.get('searchSegment') ?? '').toLowerCase().trim(),
    searchQuery: String(formData.get('searchQuery') ?? '').trim() || undefined,
    inputLabel: String(formData.get('inputLabel') ?? '').trim() || undefined,
    inputPlaceholder: String(formData.get('inputPlaceholder') ?? '').trim() || undefined,
    enabled: formData.get('enabled') || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const enabled = parsed.data.enabled === 'on';

  await db.vehicleSearchRule.upsert({
    where: {
      parkingLotId_vehicleType: {
        parkingLotId: parsed.data.parkingLotId,
        vehicleType: parsed.data.vehicleType,
      },
    },
    create: {
      parkingLotId: parsed.data.parkingLotId,
      vehicleType: parsed.data.vehicleType,
      identifierKind: parsed.data.identifierKind,
      searchSegment: parsed.data.searchSegment,
      searchQuery: parsed.data.searchQuery ?? null,
      inputLabel: parsed.data.inputLabel ?? null,
      inputPlaceholder: parsed.data.inputPlaceholder ?? null,
      enabled,
    },
    update: {
      identifierKind: parsed.data.identifierKind,
      searchSegment: parsed.data.searchSegment,
      searchQuery: parsed.data.searchQuery ?? null,
      inputLabel: parsed.data.inputLabel ?? null,
      inputPlaceholder: parsed.data.inputPlaceholder ?? null,
      enabled,
    },
  });

  await recordAudit({
    action: AuditAction.PARKING_LOT_UPDATED,
    actorId: actor.id,
    parkingLotId: parsed.data.parkingLotId,
    entity: 'VehicleSearchRule',
    metadata: {
      vehicleType: parsed.data.vehicleType,
      identifierKind: parsed.data.identifierKind,
      enabled,
    },
  });

  revalidatePath('/admin/parqueaderos');
  return ok('Regla actualizada.');
}

/* ----------------------------------------------------------------- Usuarios */

const userSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').max(120),
  email: z.string().email('Correo invalido').max(200),
  password: z.string().min(1, 'La contrasena es obligatoria'),
  role: z.enum(['SUPERADMIN', 'ADMIN_PARQUEADERO', 'PUNTO_PAGO']),
  parkingLotId: z.string().optional(),
});

export async function createUser(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const parsed = userSchema.safeParse({
    name: formData.get('name'),
    email: String(formData.get('email') ?? '').toLowerCase().trim(),
    password: formData.get('password'),
    role: formData.get('role'),
    parkingLotId: formData.get('parkingLotId') || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const weak = validatePasswordStrength(parsed.data.password);
  if (weak) return fail(weak);
  if (parsed.data.password !== String(formData.get('confirmPassword') ?? '')) {
    return fail('Las dos contrasenas no coinciden.');
  }

  // Sin parqueadero no hay forma de aislar los datos de este usuario.
  if (parsed.data.role !== 'SUPERADMIN' && !parsed.data.parkingLotId) {
    return fail('Selecciona el parqueadero al que pertenece el usuario.');
  }

  // Los usuarios de kiosco nacen con su kiosco (`createKiosk`): cada uno opera uno solo.
  if (parsed.data.role === 'PUNTO_PAGO') {
    return fail('Los usuarios de kiosco se crean en la ficha del parqueadero, en Kioscos de pago.');
  }

  try {
    const created = await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
        parkingLotId:
          parsed.data.role === 'SUPERADMIN' ? null : parsed.data.parkingLotId!,
        // La escogio el SuperAdmin con confirmacion y la entrega el: no es temporal.
        mustChangePassword: false,
      },
    });

    await recordAudit({
      action: AuditAction.USER_CREATED,
      actorId: actor.id,
      parkingLotId: created.parkingLotId,
      entity: 'User',
      entityId: created.id,
      metadata: { email: created.email, role: created.role },
    });

    revalidatePath('/admin/usuarios');
    return ok(`Usuario ${created.email} creado.`);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return fail('Ya existe un usuario con ese correo.');
    }
    console.error('[admin] error creando usuario', error);
    return fail('No fue posible crear el usuario.');
  }
}

export async function toggleUserActive(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  const userId = String(formData.get('userId') ?? '');

  if (userId === actor.id) return fail('No puedes desactivar tu propio usuario.');

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return fail('Usuario no encontrado.');

  const updated = await db.user.update({
    where: { id: userId },
    data: { active: !target.active },
  });

  // Al desactivar se revocan sus sesiones: el acceso se corta de inmediato, no
  // cuando expire su token.
  if (!updated.active) await revokeAllSessions(userId);

  await recordAudit({
    action: AuditAction.USER_UPDATED,
    actorId: actor.id,
    parkingLotId: target.parkingLotId,
    entity: 'User',
    entityId: userId,
    metadata: { active: updated.active },
  });

  revalidatePath('/admin/usuarios');
  return ok(updated.active ? 'Usuario activado.' : 'Usuario desactivado.');
}

/**
 * Cierra la sesion de un usuario a distancia.
 *
 * Es como se saca de servicio un punto de pago sin ir hasta el kiosco: el
 * operador del kiosco no tiene un boton de salida a la vista, a proposito.
 */
export async function forceLogout(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  const userId = String(formData.get('userId') ?? '');

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, parkingLotId: true },
  });
  if (!target) return fail('Usuario no encontrado.');

  await revokeAllSessions(userId);

  await recordAudit({
    action: AuditAction.AUTH_LOGOUT,
    actorId: actor.id,
    parkingLotId: target.parkingLotId,
    entity: 'User',
    entityId: userId,
    metadata: { forzado: true },
  });

  revalidatePath('/admin/usuarios');
  revalidatePath('/admin/parqueaderos');
  return ok(`Sesion de ${target.email} cerrada.`);
}

/**
 * Genera una contrasena temporal para un usuario.
 *
 * Se muestra UNA vez y no se guarda en claro en ningun lado. El usuario debera
 * cambiarla en su primer ingreso.
 */
export async function resetUserPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  const userId = String(formData.get('userId') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  /*
    La contrasena la escribe el SuperAdmin, dos veces, y la entrega el. Antes se
    generaba una al azar que se mostraba una sola vez: si se cerraba la pantalla, nadie
    la conocia. La propia no se cambia aqui (se hace pidiendo la actual en /cuenta):
    restablecerse a si mismo lo sacaba de la sesion sin saber con que volver a entrar.
  */
  if (userId === actor.id) {
    return fail('Tu propia contrasena se cambia desde "Cambiar contrasena", en el menu.');
  }
  if (!password || !confirmPassword) return fail('Escribe la nueva contrasena dos veces.');
  if (password !== confirmPassword) return fail('Las dos contrasenas no coinciden.');
  const weak = validatePasswordStrength(password);
  if (weak) return fail(weak);

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, parkingLotId: true },
  });
  if (!target) return fail('Usuario no encontrado.');

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  // La contrasena vieja deja de servir en cualquier sesion abierta.
  await revokeAllSessions(userId);

  await db.passwordResetRequest.updateMany({
    where: { userId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: actor.id },
  });

  await recordAudit({
    action: AuditAction.USER_PASSWORD_CHANGED,
    actorId: actor.id,
    parkingLotId: target.parkingLotId,
    entity: 'User',
    entityId: userId,
    metadata: { restablecidaPorAdministrador: true },
  });

  revalidatePath('/admin/usuarios');
  return ok(
    `Contrasena de ${target.email} cambiada. Entregasela por tu canal habitual; sus sesiones abiertas se cerraron.`,
  );
}

export async function dismissResetRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  const id = String(formData.get('requestId') ?? '');

  await db.passwordResetRequest.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: actor.id },
  });

  revalidatePath('/admin/usuarios');
  return ok('Solicitud descartada.');
}

/* ------------------------------------------------------------ Seguridad */

const DURACIONES_BLOQUEO: Record<string, number | 'permanente'> = {
  '60': 60,
  '1440': 24 * 60,
  '10080': 7 * 24 * 60,
  permanente: 'permanente',
};

/** Bloquea una IP a mano (SuperAdmin). */
export async function blockIpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');

  const ip = normalizeIp(String(formData.get('ip') ?? ''));
  if (!ip) return fail('Escribe una IP valida, por ejemplo 181.49.12.30.');

  const duracion = DURACIONES_BLOQUEO[String(formData.get('duration') ?? '')];
  if (!duracion) return fail('Elige por cuanto tiempo.');

  const motivo = String(formData.get('reason') ?? '').trim().slice(0, 150);
  const bloqueo = await blockIp({
    ip,
    reason: motivo ? `Manual: ${motivo}` : 'Manual',
    automatic: false,
    permanent: duracion === 'permanente',
    minutes: duracion === 'permanente' ? 0 : duracion,
    actorId: actor.id,
  });
  if (!bloqueo) {
    return fail('Esa IP esta en la lista de confianza (SECURITY_ALLOWLIST_IPS) y no se bloquea.');
  }

  await recordAudit({
    action: AuditAction.SECURITY_IP_BLOCKED,
    actorId: actor.id,
    entity: 'BlockedIp',
    entityId: ip,
    metadata: { motivo, duracion },
  });

  revalidatePath('/admin/seguridad');
  return ok(`IP ${ip} bloqueada.`);
}

/** Levanta el bloqueo de una IP (SuperAdmin). */
export async function unblockIpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  const ip = String(formData.get('ip') ?? '');

  if (!(await unblockIp(ip, actor.id))) return fail('Esa IP no estaba bloqueada.');

  await recordAudit({
    action: AuditAction.SECURITY_IP_UNBLOCKED,
    actorId: actor.id,
    entity: 'BlockedIp',
    entityId: ip,
  });

  revalidatePath('/admin/seguridad');
  return ok('IP desbloqueada.');
}
