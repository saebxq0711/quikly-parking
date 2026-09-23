'use client';

import { useEffect, useState } from 'react';
import { MdClose, MdNoPhotography, MdZoomIn } from 'react-icons/md';

/**
 * Foto de la entrada del vehiculo, tomada por las camaras del parqueadero.
 *
 * La guarda Nova Parking junto al tiquete; aqui llega como una ruta suya y se
 * pide por `/api/panel/<sitio>/foto`, que es quien tiene el token del tunel.
 *
 * Por que una miniatura y no la foto entera: en una tabla de cien tiquetes lo
 * util es reconocer el vehiculo de un vistazo —color, forma, si es moto o
 * carro—; leer la placa en la imagen es cosa de un caso puntual, y para eso se
 * abre grande al tocarla.
 *
 * Si la foto no esta (el tiquete entro a mano, la camara fallo, o el sistema del
 * parqueadero todavia no publica sus imagenes) se muestra un marcador apagado.
 * Nunca un hueco: un espacio vacio en una tabla se lee como un fallo de esta
 * pantalla.
 */
export function VehiclePhoto({
  src,
  slug,
  label,
  size = 'thumb',
}: {
  /** Ruta de la foto dentro del sistema del parqueadero (`/media/...`). */
  src: string | null;
  slug: string;
  /** Codigo o placa: identifica la foto al ampliarla y para quien no la ve. */
  label: string;
  size?: 'thumb' | 'wide';
}) {
  const [falla, setFalla] = useState(false);
  const [abierta, setAbierta] = useState(false);

  const caja =
    size === 'wide'
      ? 'h-20 w-32 rounded-xl'
      : 'h-11 w-16 rounded-lg';

  if (!src || falla) {
    return (
      <span
        title="Sin foto de entrada"
        className={`flex ${caja} items-center justify-center bg-[var(--fill-soft)] text-[var(--text-muted)] ring-1 ring-inset ring-[var(--line-subtle)]`}
      >
        <MdNoPhotography className="h-4 w-4" aria-hidden focusable="false" />
        <span className="sr-only">Sin foto de entrada</span>
      </span>
    );
  }

  const url = `/api/panel/${slug}/foto?src=${encodeURIComponent(src)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="Ver la foto de entrada"
        className={`group relative block ${caja} overflow-hidden bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--line-subtle)] transition-shadow duration-150 hover:ring-brand-400/60`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- la sirve nuestra
            propia ruta ya recortada; pasarla por el optimizador de Next la
            volveria a descargar por el tunel en cada tamano. */}
        <img
          src={url}
          alt={`Entrada de ${label}`}
          loading="lazy"
          onError={() => setFalla(true)}
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-ink-950/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <MdZoomIn className="h-4 w-4 text-white" aria-hidden focusable="false" />
        </span>
      </button>

      {abierta ? (
        <Lightbox url={url} label={label} onClose={() => setAbierta(false)} />
      ) : null}
    </>
  );
}

/** La foto en grande, sobre el resto de la pantalla. */
function Lightbox({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string;
  onClose: () => void;
}) {
  // Escape cierra: es lo que espera cualquiera que abra algo encima.
  useEffect(() => {
    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de entrada de ${label}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="page-in w-full max-w-3xl overflow-hidden rounded-2xl bg-[var(--surface-raised)] ring-1 ring-[var(--line-strong)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line-subtle)] px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
            <p className="text-xs text-[var(--text-muted)]">
              Foto tomada por la camara al entrar el vehiculo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] hover:text-[var(--text-primary)]"
          >
            <MdClose className="h-5 w-5" aria-hidden focusable="false" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- misma razon que arriba. */}
        <img
          src={url}
          alt={`Entrada de ${label}`}
          className="max-h-[70vh] w-full bg-[var(--surface-sunken)] object-contain"
        />
      </div>
    </div>
  );
}
