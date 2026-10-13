'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, CardHeader, buttonClassName } from '@/components/ui';
import { removeParkingLotLogo, saveParkingLotLogo, type ActionResult } from '../../actions';
import { StatusPill } from './redeban-card';

/** Lado mayor del logo guardado. En el kiosco de 27" se ve a unos 180 px: sobra nitidez. */
const LADO_MAX = 512;

/**
 * Achica la imagen en el navegador antes de subirla: el logo que llega suele ser una
 * imagen de 1500 px y cientos de KB, y se mostraria en cada pantalla del panel y del
 * kiosco. Sale en WebP (conserva la transparencia); si el navegador no lo sabe hacer,
 * en PNG.
 */
async function achicar(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(imagen.width * escala));
  lienzo.height = Math.max(1, Math.round(imagen.height * escala));
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('sin canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();

  const comoBlob = (tipo: string, calidad?: number) =>
    new Promise<Blob | null>((listo) => lienzo.toBlob(listo, tipo, calidad));
  const webp = await comoBlob('image/webp', 0.9);
  if (webp && webp.type === 'image/webp') return webp;
  const png = await comoBlob('image/png');
  if (!png) throw new Error('sin imagen');
  return png;
}

/**
 * Logo del parqueadero: reemplaza al de Quikly Parking en el panel de su administrador
 * y en sus kioscos (`lib/parking/logo.ts`). La vista previa lo muestra sobre los dos
 * fondos donde va a quedar: la barra negra del panel y el encabezado claro del kiosco.
 */
export function LogoCard({
  parkingLotId,
  lotName,
  logoUrl,
}: {
  parkingLotId: string;
  lotName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ActionResult | null>(null);
  const [ocupado, empezar] = useTransition();

  function subir(archivo: File | undefined) {
    if (!archivo) return;
    setResultado(null);
    empezar(async () => {
      let imagen: Blob;
      try {
        imagen = await achicar(archivo);
      } catch {
        setResultado({ ok: false, message: 'No se pudo leer esa imagen. Usa un PNG, JPG o WebP.' });
        return;
      }
      const datos = new FormData();
      datos.set('parkingLotId', parkingLotId);
      datos.set('logo', imagen, imagen.type === 'image/webp' ? 'logo.webp' : 'logo.png');
      setResultado(await saveParkingLotLogo(null, datos));
      router.refresh();
    });
    // Elegir otra vez el mismo archivo tambien debe disparar el cambio.
    if (entrada.current) entrada.current.value = '';
  }

  function quitar() {
    setResultado(null);
    empezar(async () => {
      const datos = new FormData();
      datos.set('parkingLotId', parkingLotId);
      setResultado(await removeParkingLotLogo(null, datos));
      router.refresh();
    });
  }

  const vista = logoUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element -- la sirve nuestra ruta */
    <img src={logoUrl} alt={`Logo de ${lotName}`} className="h-16 w-auto max-w-[11rem] object-contain" />
  ) : null;

  return (
    <Card>
      <CardHeader
        title="Logo"
        description="Se ve en el panel del administrador y en los kioscos de este parqueadero, en lugar del de Quikly Parking."
        action={<StatusPill ok={Boolean(logoUrl)} okLabel="Propio" pendingLabel="El de Quikly" />}
      />

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <figure className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl bg-[var(--surface-chrome)] px-4">
            {vista ?? (
              <Image src="/quikly-parking.png" alt="Quikly Parking" width={783} height={269} className="h-9 w-auto" />
            )}
            <figcaption className="text-[11px] text-[var(--text-on-chrome-muted)]">Panel</figcaption>
          </figure>
          <figure className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl bg-white px-4 ring-1 ring-inset ring-[var(--line-subtle)]">
            {vista ?? (
              <Image src="/quikly-parking-positivo.png" alt="Quikly Parking" width={783} height={269} className="h-9 w-auto" />
            )}
            <figcaption className="text-[11px] text-ink-500">Kiosco</figcaption>
          </figure>
        </div>

        {resultado ? (
          <Alert tone={resultado.ok ? 'success' : 'error'}>{resultado.message}</Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className={buttonClassName('confirm', 'md', ocupado ? 'pointer-events-none opacity-60' : 'cursor-pointer')}>
            {ocupado ? 'Guardando…' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
            <input
              ref={entrada}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={ocupado}
              onChange={(event) => subir(event.target.files?.[0])}
            />
          </label>
          {logoUrl ? (
            <button
              type="button"
              onClick={quitar}
              disabled={ocupado}
              className={buttonClassName('ghost', 'md')}
            >
              Quitar logo
            </button>
          ) : null}
          <p className="text-xs text-[var(--text-muted)]">
            PNG, JPG o WebP. Mejor cuadrado o con fondo transparente; se ajusta solo de tamaño.
          </p>
        </div>
      </div>
    </Card>
  );
}
