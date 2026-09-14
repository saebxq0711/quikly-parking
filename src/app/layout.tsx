import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NavigationProgress } from '@/components/navigation-progress';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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
  themeColor: '#4f46e5',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO" className={inter.variable}>
      <body className="font-sans antialiased">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
