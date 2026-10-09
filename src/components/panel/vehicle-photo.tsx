'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdClose, MdLogin, MdLogout, MdNoPhotography, MdOpenInNew, MdPhotoLibrary } from 'react-icons/md';

/**
 * Fotos del vehiculo tomadas por las camaras del parqueadero: la de ENTRADA y,
 * cuando el sistema la tomo, la de SALIDA.
 *
 * Las guarda Nova Parking junto al tiquete; aqui llegan como rutas suyas y se
 * piden por `/api/panel/<sitio>/foto`, que es quien tiene el token del tunel.
 *
 * En la tabla va una miniatura de la entrada: en una lista de cien tiquetes lo
 * util es reconocer el vehiculo de un vistazo. Si tambien hay foto de salida,
 * la miniatura lo avisa con una marca, y al tocarla se abren las dos lado a
 * lado: entro asi, salio asi.
 *
 * Sin foto (el tiquete entro a mano, la camara fallo) se muestra un marcador
 * apagado. Nunca un hueco: un espacio vacio en una tabla se lee como un fallo
 * de esta pantalla.
 */
export function VehiclePhoto({
  src,
  exitSrc = null,
  slug,
  label,
  size = 'thumb',
  enteredAt = null,
  exitedAt = null,
  inside = false,
}: {
  /** Ruta de la foto de entrada dentro del sistema del parqueadero. */
  src: string | null;
  /** Ruta de la foto de salida, si el sistema la tomo. */
  exitSrc?: string | null;
  slug: string;
  /** Codigo o placa: identifica las fotos al ampliarlas y para quien no las ve. */
  label: string;
  size?: 'thumb' | 'wide';
  /** Hora de entrada y de salida (ISO), para el pie de cada foto. */
  enteredAt?: string | null;
  exitedAt?: string | null;
  /** El vehiculo sigue adentro: la salida no existe todavia. */
  inside?: boolean;
}) {
  const [falla, setFalla] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);

  const cerrar = useCallback(() => {
    setAbierta(false);
    // El foco vuelve a la miniatura: quien usa teclado sigue donde estaba.
    requestAnimationFrame(() => disparador.current?.focus());
  }, []);

  const caja = size === 'wide' ? 'h-20 w-32 rounded-xl' : 'h-11 w-16 rounded-lg';
  const miniatura = src ?? exitSrc;

  if (!miniatura || falla) {
    return (
      <span
        title="Sin foto"
        className={`flex ${caja} items-center justify-center bg-[var(--fill-soft)] text-[var(--text-muted)] ring-1 ring-inset ring-[var(--line-subtle)]`}
      >
        <MdNoPhotography className="h-4 w-4" aria-hidden focusable="false" />
        <span className="sr-only">Sin foto</span>
      </span>
    );
  }

  const conSalida = Boolean(exitSrc);

  return (
    <>
      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierta(true)}
        aria-haspopup="dialog"
        title={conSalida ? 'Ver fotos de entrada y salida' : 'Ver la foto de entrada'}
        className={`group relative block ${caja} overflow-hidden bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--line-subtle)] transition-shadow duration-150 hover:ring-2 hover:ring-brand-400`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- la sirve nuestra
            propia ruta; pasarla por el optimizador de Next la volveria a
            descargar por el tunel en cada tamano. */}
        <img
          src={urlDe(slug, miniatura)}
          alt={`${src ? 'Entrada' : 'Salida'} de ${label}`}
          loading="lazy"
          onError={() => setFalla(true)}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
        />
        {conSalida ? (
          <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-ink-950/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            <MdPhotoLibrary className="h-3 w-3" aria-hidden focusable="false" />2
            <span className="sr-only"> fotos: entrada y salida</span>
          </span>
        ) : null}
      </button>

      {abierta ? (
        <PhotoViewer
          slug={slug}
          label={label}
          entrySrc={src}
          exitSrc={exitSrc}
          enteredAt={enteredAt}
          exitedAt={exitedAt}
          inside={inside}
          onClose={cerrar}
        />
      ) : null}
    </>
  );
}

function urlDe(slug: string, ruta: string): string {
  return `/api/panel/${slug}/foto?src=${encodeURIComponent(ruta)}`;
}

const formatoHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

function hora(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : formatoHora.format(fecha);
}

/**
 * Las fotos en grande, sobre la pantalla.
 *
 * Se dibuja en `<body>` con un portal, no donde esta la miniatura. El panel
 * entra con una animacion que deja aplicado un `transform` en su contenedor, y
 * un `position: fixed` dentro de un elemento con `transform` queda fijo a ESE
 * elemento y no a la pantalla: la ventana aparecia centrada en la pagina entera,
 * y en una pagina larga habia que bajar hasta encontrarla.
 */
function PhotoViewer({
  slug,
  label,
  entrySrc,
  exitSrc,
  enteredAt,
  exitedAt,
  inside,
  onClose,
}: {
  slug: string;
  label: string;
  entrySrc: string | null;
  exitSrc: string | null;
  enteredAt: string | null;
  exitedAt: string | null;
  inside: boolean;
  onClose: () => void;
}) {
  const titulo = useId();
  const ventana = useRef<HTMLDivElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!montado) return;
    botonCerrar.current?.focus();

    // La pagina de atras no se mueve mientras las fotos estan abiertas. Se
    // compensa el ancho de la barra de desplazamiento para que nada salte.
    const { body, documentElement } = document;
    const previo = { overflow: body.style.overflow, padding: body.style.paddingRight };
    const barra = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (barra > 0) body.style.paddingRight = `${barra}px`;

    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // El foco no se escapa de la ventana con Tab.
      if (event.key === 'Tab' && ventana.current) {
        const enfocables = ventana.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (!primero || !ultimo) return;
        if (event.shiftKey && document.activeElement === primero) {
          event.preventDefault();
          ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
          event.preventDefault();
          primero.focus();
        }
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
      body.style.overflow = previo.overflow;
      body.style.paddingRight = previo.padding;
    };
  }, [montado, onClose]);

  if (!montado) return null;

  // Adentro ahora: solo existe la entrada, se muestra sola y mas grande.
  const dosFotos = !inside;

  return createPortal(
    <div
      className="photo-overlay fixed inset-0 z-[70] overflow-y-auto bg-ink-950/75 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-3 sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={ventana}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titulo}
          className={`page-in w-full ${dosFotos ? 'max-w-5xl' : 'max-w-3xl'} overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-lift)] ring-1 ring-[var(--line-strong)]`}
        >
          <header className="flex items-center justify-between gap-4 border-b border-[var(--line-subtle)] px-5 py-3.5">
            <div className="min-w-0">
              <h2 id={titulo} className="tnum truncate text-base font-semibold text-[var(--text-primary)]">
                {label}
              </h2>
              <p className="text-[13px] text-[var(--text-muted)]">
                {dosFotos ? 'Fotos de las cámaras de entrada y salida' : 'Foto de la cámara de entrada'}
              </p>
            </div>
            <button
              ref={botonCerrar}
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)]"
            >
              <MdClose className="h-5 w-5" aria-hidden focusable="false" />
            </button>
          </header>

          <div className={`grid gap-3 p-3 sm:gap-4 sm:p-4 ${dosFotos ? 'md:grid-cols-2' : ''}`}>
            <Shot
              kind="entrada"
              url={entrySrc ? urlDe(slug, entrySrc) : null}
              when={hora(enteredAt)}
              label={label}
              tall={!dosFotos}
              emptyTitle="Sin foto de entrada"
              emptyHint="La cámara de entrada no tomó foto de este vehículo."
            />
            {dosFotos ? (
              <Shot
                kind="salida"
                url={exitSrc ? urlDe(slug, exitSrc) : null}
                when={hora(exitedAt)}
                label={label}
                emptyTitle={exitedAt ? 'Sin foto de salida' : 'Todavía no ha salido'}
                emptyHint={
                  exitedAt
                    ? 'La cámara de salida no tomó foto en esta salida.'
                    : 'La foto se toma cuando el vehículo pasa por la salida.'
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Una foto con su encabezado (entrada o salida, y la hora). */
function Shot({
  kind,
  url,
  when,
  label,
  tall = false,
  emptyTitle,
  emptyHint,
}: {
  kind: 'entrada' | 'salida';
  url: string | null;
  when: string | null;
  label: string;
  tall?: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'falla'>('cargando');
  const Icono = kind === 'entrada' ? MdLogin : MdLogout;
  const titulo = kind === 'entrada' ? 'Entrada' : 'Salida';
  const disponible = Boolean(url) && estado !== 'falla';

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--fill-soft)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden focusable="false" />
          </span>
          {/* Titulo y hora en dos renglones fijos: en el celular no se parten a mitad. */}
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold text-[var(--text-primary)]">{titulo}</span>
            <span className="tnum block truncate text-[13px] text-[var(--text-muted)]">
              {when ?? (kind === 'entrada' ? 'Hora de entrada no registrada' : 'Sin hora de salida')}
            </span>
          </span>
        </span>
        {disponible && url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener"
            title="Abrir la foto en tamaño real"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)]"
          >
            <MdOpenInNew className="h-3.5 w-3.5" aria-hidden focusable="false" />
            <span className="hidden sm:inline">Tamaño real</span>
            <span className="sr-only sm:hidden">Abrir en tamaño real</span>
          </a>
        ) : null}
      </figcaption>

      <div
        className={`relative overflow-hidden rounded-xl bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--line-subtle)] ${
          tall ? 'aspect-[2688/1552] max-h-[calc(100dvh-12rem)]' : 'aspect-[2688/1552]'
        }`}
      >
        {disponible && url ? (
          <>
            {estado === 'cargando' ? (
              // `.skeleton` fija su propia posicion: va dentro de una capa que si se estira.
              <div className="absolute inset-0" role="status">
                <div className="skeleton h-full w-full !rounded-none" aria-hidden />
                <span className="absolute inset-0 flex items-center justify-center text-[13px] font-medium text-[var(--text-muted)]">
                  Cargando foto…
                </span>
              </div>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- misma razon que la miniatura. */}
            <img
              src={url}
              alt={`${titulo} de ${label}`}
              onLoad={() => setEstado('lista')}
              onError={() => setEstado('falla')}
              className={`h-full w-full object-contain transition-opacity duration-200 ${
                estado === 'lista' ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <MdNoPhotography className="h-7 w-7 text-[var(--text-muted)]" aria-hidden focusable="false" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {estado === 'falla' ? 'No se pudo cargar la foto' : emptyTitle}
            </p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-[var(--text-muted)]">
              {estado === 'falla' ? 'El sistema del parqueadero no la entregó. Intenta de nuevo en un momento.' : emptyHint}
            </p>
          </div>
        )}
      </div>
    </figure>
  );
}
