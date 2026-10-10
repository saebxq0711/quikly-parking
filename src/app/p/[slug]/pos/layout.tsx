import type { Viewport } from 'next';
import { NoZoom } from '@/components/pos/no-zoom';

/**
 * Area del kiosco (`/p/<sitio>/pos` y su prueba de impresora).
 *
 * Aqui el zoom va bloqueado: la raiz lo permite (`maximumScale: 5`) por
 * accesibilidad en el panel, pero el kiosco es una pantalla tactil de
 * autoservicio que tiene que quedarse al 100 % pase lo que pase.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  themeColor: '#0b0b0b',
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NoZoom />
      {children}
    </>
  );
}
