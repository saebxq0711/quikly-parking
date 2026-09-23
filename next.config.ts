import type { NextConfig } from 'next';

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
  // Cabeceras de seguridad (CLAUDE.md seccion 25). HSTS lo agrega el proxy/CDN en produccion.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
