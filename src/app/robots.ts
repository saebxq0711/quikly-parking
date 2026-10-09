import type { MetadataRoute } from 'next';

/** Herramienta privada: ningun buscador debe recorrerla ni listarla. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
