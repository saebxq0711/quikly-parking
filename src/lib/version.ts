/**
 * Version desplegada de la aplicacion.
 *
 * El kiosco la recibe al pintarse y la compara cada minuto con la del servidor
 * (`GET /api/pos/payments`): si cambio, se recarga solo en cuanto esta libre. Un kiosco
 * no tiene quien oprima F5, y sin esto seguia mostrando la version vieja hasta que
 * alguien lo reiniciara.
 *
 * En Vercel cada despliegue trae su id; en local no hay, y la version es fija.
 */
export const VERSION_DESPLEGADA =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';

/** Cabecera con que el kiosco manda su version y el servidor responde la suya. */
export const CABECERA_VERSION = 'x-kiosco-version';
