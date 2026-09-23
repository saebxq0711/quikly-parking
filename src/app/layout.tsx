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
  themeColor: '#b58fff',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO" className={poppins.variable}>
      <body className="font-sans antialiased">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
