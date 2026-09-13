import { z } from 'zod';

/**
 * Validacion de las variables de entorno al arrancar.
 *
 * Se falla temprano y con un mensaje claro en vez de dejar que un secreto
 * ausente reviente a mitad de un cobro. Este modulo solo debe importarse desde
 * codigo de servidor: nunca desde un componente cliente.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET debe tener al menos 32 caracteres'),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(480),

  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(1, 'CREDENTIALS_ENCRYPTION_KEY es obligatoria'),

  /**
   * Tiempo maximo de espera al sistema de un parqueadero.
   * La URL y el token NO estan aqui: son propios de cada sitio y se configuran
   * desde la administracion, porque una sola web atiende a varios.
   */
  NOVA_PARKING_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  SIIGO_API_URL: z.string().url().default('https://api.siigo.com'),
  SIIGO_USERNAME: z.string().optional(),
  SIIGO_ACCESS_KEY: z.string().optional(),
  SIIGO_PARTNER_ID: z.string().default('PuntoPagoParking'),
  SIIGO_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  REDEBAN_DIRECT_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  REDEBAN_BASE_URL: z.string().optional(),
  REDEBAN_CODIGO_UNICO: z.string().optional(),
  REDEBAN_USUARIO: z.string().optional(),
  REDEBAN_CLAVE: z.string().optional(),
  REDEBAN_CODIGO_TERMINAL: z.string().optional(),
  REDEBAN_RED: z.string().default('0'),

  // Correo saliente. Opcional a proposito: sin esto la plataforma NO promete un
  // enlace por correo, cae al flujo manual del super administrador.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /** Cuanto vive el enlace de restablecimiento. */
  RESET_TOKEN_MINUTES: z.coerce.number().int().positive().default(30),

  APP_URL: z.string().url().default('http://127.0.0.1:3000'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

/*
  Variables vacias = no definidas. En Vercel (y en un .env copiado a medias) es comun
  dejar `SIIGO_API_URL=` sin valor: sin esto, "" no pasa la validacion de URL y el build
  falla en vez de usar el valor por defecto.
*/
const entorno: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).map(([clave, valor]) => [
    clave,
    typeof valor === 'string' && valor.trim() === '' ? undefined : valor?.trim(),
  ]),
);

/*
  APP_URL va en los QR impresos y en los enlaces de correo. Si no se configuro, en Vercel
  se toma el dominio de produccion del proyecto (o el de la vista previa), que Vercel
  entrega sin el https://.
*/
if (!entorno.APP_URL) {
  const dominioVercel = entorno.VERCEL_PROJECT_PRODUCTION_URL ?? entorno.VERCEL_URL;
  if (dominioVercel) entorno.APP_URL = `https://${dominioVercel}`;
} else if (!/^https?:\/\//i.test(entorno.APP_URL)) {
  // Escrito sin protocolo ("pago.midominio.com"): se asume https.
  entorno.APP_URL = `https://${entorno.APP_URL}`;
}

const parsed = schema.safeParse(entorno);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(
    `Configuracion invalida. Revisa el archivo .env (usa .env.example como guia):\n${detalle}`,
  );
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
