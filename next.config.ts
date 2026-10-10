import type { NextConfig } from 'next';

const esDesarrollo = process.env.NODE_ENV !== 'production';

/*
  Politica de contenido. Todo sale de este mismo dominio: no hay scripts, fuentes
  ni imagenes de terceros (Poppins la sirve Next desde aqui). 'unsafe-inline' en
  scripts hace falta por el script del tema del kiosco y los de Next; lo que esta
  politica corta es lo demas: que la pagina se meta en un iframe ajeno, que un
  script inyectado mande datos a otro dominio (connect-src), plugins y <base>.
  En desarrollo, Next necesita eval y el websocket de recarga.
*/
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${esDesarrollo ? ' ws: wss:' : ''}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(esDesarrollo ? [] : ['upgrade-insecure-requests']),
].join('; ');

/** Imagenes publicas de la marca que se usan fuera del sitio (correos, servidor del parqueadero). */
const IMAGENES_DE_MARCA = 'quikly-parking[a-z-]*\\.png|icon\\.png|apple-icon\\.png';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Sin esto Next infiere la raiz mirando hacia arriba y encuentra otro
  // package-lock.json fuera del proyecto, lo que rompe el trazado de archivos
  // al empaquetar para produccion.
  outputFileTracingRoot: __dirname,
  // El reporte en Excel dibuja el logo en la portada y lo lee del disco. En
  // produccion `public/` lo sirve el CDN y no viaja con la funcion, asi que hay
  // que incluirlo a mano o el reporte saldria sin marca.
  outputFileTracingIncludes: {
    '/api/panel/[slug]/reporte': ['./public/quikly-parking.png'],
  },
  // Cabeceras de seguridad (CLAUDE.md seccion 25; detalle en SEGURIDAD.md).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          // Dos años, subdominios incluidos: el navegador nunca vuelve a intentar http.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // usb=(self): el kiosco imprime el comprobante por WebUSB (`lib/printing/usb-printer.ts`).
          // Con usb=() la impresora quedaba bloqueada; solo este sitio puede pedirla.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(self)' },
          // Aisla la ventana de otras pestañas.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          // Herramienta privada: que ningun buscador la indexe.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // Ningun otro sitio carga nuestros recursos... salvo las imagenes de la marca (abajo).
        source: `/((?!${IMAGENES_DE_MARCA}).*)`,
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }],
      },
      {
        /*
          El logo y los iconos los muestran los CORREOS (comprobante, restablecer
          contrasena), que se abren desde otro sitio: Outlook/Hotmail web, apps de
          correo. Con `same-origin` el navegador los bloqueaba y el correo salia con la
          imagen rota. Son publicos y no cambian a menudo: un dia de cache.
        */
        source: `/:archivo(${IMAGENES_DE_MARCA})`,
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
