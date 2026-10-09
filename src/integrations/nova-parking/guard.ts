import { AppError } from '@/lib/errors';
import { hit } from '@/lib/security/limiter';

/**
 * Proteccion del sistema del parqueadero (Nova Parking, el servidor de Moyano).
 *
 * Al tunel solo llega esta plataforma —el token vive en el servidor y el
 * navegador nunca habla con el—, pero hasta ahora cada pagina del panel, cada
 * refresco automatico y cada busqueda del kiosco era una consulta a su
 * servidor, sin tope. Aqui se le pone uno:
 *
 *  1. LIMITE COMPARTIDO de lecturas por parqueadero (todas las instancias
 *     suman): 240 por minuto. El uso real esta muy por debajo; lo que lo
 *     supere es un bucle o un abuso, y se corta antes de llegar a el.
 *  2. CORTACIRCUITO: si su servidor falla 5 veces seguidas (caido, lento, 5xx),
 *     se deja de consultarlo 20 segundos. Insistirle a un servidor que no
 *     responde solo lo hunde mas y deja al kiosco esperando el timeout entero.
 *  3. CACHE CORTA (en el cliente, `read`): el panel con varias pestañas y su
 *     refresco cada 30 s pedia lo mismo una y otra vez.
 *
 * Las ESCRITURAS (confirmar un pago) no pasan por el limite ni por el
 * cortacircuito: un cobro ya aprobado en el datafono tiene que llegar a su
 * sistema siempre. Solo informan si salio bien.
 */

const LECTURAS_POR_MINUTO = 240;
const FALLOS_PARA_ABRIR = 5;
const ABIERTO_MS = 20_000;

interface Circuito {
  fallosSeguidos: number;
  abiertoHasta: number;
}

const circuitos = new Map<string, Circuito>();

/** Llama antes de cada LECTURA. Lanza si no se debe consultar ahora. */
export async function beforeUpstreamRead(clave: string, operation: string): Promise<void> {
  const circuito = circuitos.get(clave);
  if (circuito && circuito.abiertoHasta > Date.now()) {
    throw new AppError('UPSTREAM_UNAVAILABLE', {
      publicMessage:
        'El sistema del parqueadero no esta respondiendo. Intenta de nuevo en unos segundos.',
      detail: { operation, circuito: 'abierto' },
    });
  }

  const { count } = await hit(`nova:${clave}`, 60_000);
  if (count > LECTURAS_POR_MINUTO) {
    throw new AppError('RATE_LIMITED', {
      publicMessage:
        'Hay demasiadas consultas al sistema del parqueadero en este momento. Espera unos segundos.',
      detail: { operation, count },
    });
  }
}

/**
 * Llama despues de cada peticion. `fallo` es solo lo que indica que su servidor
 * esta mal (sin conexion, timeout, 5xx), no un 404 o un 400, que son respuestas
 * normales de un servidor sano.
 */
export function recordUpstreamResult(clave: string, fallo: boolean): void {
  if (!fallo) {
    circuitos.delete(clave);
    return;
  }
  const circuito = circuitos.get(clave) ?? { fallosSeguidos: 0, abiertoHasta: 0 };
  circuito.fallosSeguidos += 1;
  if (circuito.fallosSeguidos >= FALLOS_PARA_ABRIR) {
    circuito.abiertoHasta = Date.now() + ABIERTO_MS;
    circuito.fallosSeguidos = 0;
    console.warn('[nova] el sistema del parqueadero falla seguido; se pausan las lecturas', {
      clave,
      segundos: ABIERTO_MS / 1000,
    });
  }
  circuitos.set(clave, circuito);
}

/* ------------------------------------------------------- Cache corta */

const CACHE_MS = 10_000;
const MAX_ENTRADAS = 500;
const cache = new Map<string, { expira: number; valor: Promise<unknown> }>();

/**
 * Resultado de una lectura reciente identica, o la lectura en curso si otra
 * peticion ya la esta haciendo. Solo se cachea lo que salio bien.
 */
export function cachedRead<T>(llave: string, leer: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const previa = cache.get(llave);
  if (previa && previa.expira > ahora) return previa.valor as Promise<T>;

  if (cache.size >= MAX_ENTRADAS) {
    for (const [k, entrada] of cache) if (entrada.expira <= ahora) cache.delete(k);
    if (cache.size >= MAX_ENTRADAS) cache.clear();
  }

  const valor = leer().catch((error) => {
    cache.delete(llave);
    throw error;
  });
  cache.set(llave, { expira: ahora + CACHE_MS, valor });
  return valor;
}
