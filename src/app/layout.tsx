import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { NavigationProgress } from '@/components/navigation-progress';
import './globals.css';

/**
 * Poppins es la tipografia institucional de Quikly en digital (Manual de Marca,
 * "TIPOGRAFIA"): el manual pide usar solo las tipografias de la marca. Se cargan
 * los cuatro pesos que usa la interfaz — el kiosco vive en negrita y la
 * administracion en regular — y ninguno mas, que cada peso es una descarga.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Quikly Parking',
    template: '%s | Quikly Parking',
  },
  description:
    'Plataforma de gestion y cobro de parqueaderos: consulta de vehiculos, pagos y facturacion.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El punto de pago corre en pantallas tactiles fijas; el zoom accidental
  // desalinea la interfaz. Se mantiene `user-scalable` por accesibilidad.
  maximumScale: 5,
  themeColor: '#0b0b0b',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
      `suppressHydrationWarning`: en el kiosco, el script de dia/noche
      (`theme-script.ts`) pone `data-theme` en <html> ANTES de que React monte,
      para que de noche no haya un fogonazo blanco. Es intencional, asi que el
      atributo distinto entre servidor y navegador no es un error. Solo silencia
      los atributos de esta etiqueta; el resto de la pagina sigue vigilado.
    */
    <html lang="es-CO" className={poppins.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
