import type { StrikeKind } from './blocklist';

/**
 * Reglas para reconocer trafico malicioso sin consultar nada.
 *
 * Esta aplicacion es Next.js: no tiene PHP, ni WordPress, ni `.env` publico, ni
 * `.git` servido. Quien pide esas rutas no es un cliente del parqueadero, es un
 * escaner recorriendo internet buscando una puerta abierta. Responderle 404 y
 * sumarle faltas lo saca rapido.
 */

const RUTAS_TRAMPA: RegExp[] = [
  /\.(php\d?|phtml|asp|aspx|jsp|cgi|pl|env|ini|bak|old|sql|swp|log|ya?ml|DS_Store)$/i,
  /(^|\/)\.(env|git|svn|hg|aws|ssh|docker|vscode|idea|htaccess|htpasswd)(\/|$|\.)/i,
  /^\/(wp-|wordpress|xmlrpc|phpmyadmin|pma|myadmin|mysql|adminer|cgi-bin|boaform|hnap1|owa|autodiscover|ecp|remote\/login|vendor\/|solr|actuator|server-status|console|jenkins|manager\/html|telescope|_ignition|debug\/default|druid|geoserver|cpanel|webdav)/i,
  /\/etc\/(passwd|shadow)|\/proc\/self|win\.ini|boot\.ini/i,
];

/** Recorridos de directorio y caracteres que ninguna ruta nuestra usa. */
const SECUENCIAS_PELIGROSAS = /(\.\.\/|\.\.\\|%2e%2e|%252e|%00|\x00|<script|%3cscript|union(\s|%20|\+)+select|\$\{jndi:)/i;

/** Herramientas de ataque que se anuncian en el User-Agent. */
const AGENTES_DE_ATAQUE =
  /(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|wpscan|dirbuster|gobuster|ffuf|feroxbuster|hydra|havij|netsparker|w3af|openvas|nessus|joomscan|whatweb|jaeles|xray|commix|arachni|skipfish|zmeu|morfeus|fimap)/i;

export interface Hallazgo {
  kind: StrikeKind;
  detail: string;
}

/** Revisa ruta, consulta y agente. null = nada sospechoso. */
export function detectMalicious(
  pathname: string,
  search: string,
  userAgent: string | null,
): Hallazgo | null {
  if (userAgent && AGENTES_DE_ATAQUE.test(userAgent)) {
    return { kind: 'BAD_AGENT', detail: userAgent.slice(0, 120) };
  }

  let crudo = pathname + search;
  try {
    crudo += ` ${decodeURIComponent(pathname + search)}`;
  } catch {
    // Codificacion rota a proposito: tambien es sospechosa.
    return { kind: 'TRAP', detail: 'codificacion invalida' };
  }
  if (SECUENCIAS_PELIGROSAS.test(crudo)) return { kind: 'TRAP', detail: 'secuencia peligrosa' };
  if (RUTAS_TRAMPA.some((regla) => regla.test(pathname))) return { kind: 'TRAP', detail: 'ruta de escaneo' };
  return null;
}

/** Metodos que usa la aplicacion. Cualquier otro se rechaza sin procesarlo. */
export const METODOS_PERMITIDOS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);

/** Tamaño maximo de un cuerpo de peticion. El mas grande nuestro es un formulario. */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * True si una peticion de escritura viene de este mismo sitio.
 *
 * Los navegadores mandan `Origin` en todo POST, y `Sec-Fetch-Site` en los
 * modernos. Un POST sin ninguno de los dos no lo hizo un navegador nuestro (lo
 * hizo un script), y uno con otro origen es un intento de CSRF: otra pagina
 * tratando de usar la sesion del usuario.
 */
export function isSameOrigin(headers: Headers, host: string | null): boolean {
  const origin = headers.get('origin');
  if (origin && origin !== 'null') {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const sitio = headers.get('sec-fetch-site');
  return sitio === 'same-origin';
}
