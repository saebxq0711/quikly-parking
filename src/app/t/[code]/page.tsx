import Image from 'next/image';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { SaveTicket } from './save-ticket';

export const metadata = {
  title: 'Tu tiquete',
  // Cada pagina es de una sola persona: que no aparezca en buscadores.
  robots: { index: false, follow: false },
};

/** Letra-numero-letra-numero-numero, sin I ni O. El mismo patron que Nova Parking. */
const CODIGO = /^[A-HJ-NP-Z][0-9][A-HJ-NP-Z][0-9]{2}$/;

/**
 * El tiquete en el celular del cliente.
 *
 * A esta pagina llega quien escanea con su celular el QR de la pantalla de entrada
 * (`https://<aqui>/t/A7B48`). Es la forma de llevarse el tiquete sin papel: la guarda,
 * le toma captura, o la vuelve a abrir desde el historial.
 *
 * NO CONSULTA NADA. El codigo viene en la direccion y la pagina solo lo dibuja. Es a
 * proposito: si buscara el tiquete en el sistema del parqueadero, cualquiera podria
 * probar codigos para saber cuales estan adentro. Asi no revela mas de lo que ya trae
 * el propio enlace, y ademas funciona aunque el parqueadero este sin internet.
 *
 * El QR que dibuja lleva el CODIGO solo, igual que el tiquete impreso: es lo que leen
 * todos los escaneres de la salida.
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const codigo = decodeURIComponent(code).trim().toUpperCase();
  if (!CODIGO.test(codigo)) notFound();

  const qr = await QRCode.toString(codigo, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-base)] px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Image
          src="/nova-parking-horizontal.png"
          alt="Nova Parking"
          width={1433}
          height={360}
          priority
          className="mx-auto h-8 w-auto"
        />

        <h1 className="mt-7 text-lg font-semibold text-white">Tu tiquete</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Muestralo en el punto de pago o en la salida.
        </p>

        {/* Placa blanca: un QR sobre fondo oscuro lo leen mal muchos escaneres. */}
        <div
          className="mx-auto mt-6 w-64 max-w-full rounded-2xl bg-white p-4"
          aria-label={`Codigo QR del tiquete ${codigo}`}
          role="img"
          dangerouslySetInnerHTML={{ __html: qr }}
        />

        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Codigo
        </p>
        <p className="tnum mt-1 text-5xl font-bold tracking-[0.2em] text-white">{codigo}</p>

        <SaveTicket code={codigo} />

        <p className="mx-auto mt-5 max-w-xs text-[13px] leading-relaxed text-[var(--text-muted)]">
          Al salir, escanea este QR en el punto de pago o escribe el codigo manualmente.
        </p>
      </div>
    </main>
  );
}
