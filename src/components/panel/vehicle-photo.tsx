'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdClose, MdLogin, MdLogout, MdNoPhotography, MdOpenInNew, MdPhotoLibrary } from 'react-icons/md';
import type { TicketPhoto } from '@/integrations/nova-parking/panel';

/**
 * Fotos del vehiculo tomadas por las camaras del parqueadero: las de ENTRADA y,
 * cuando el sistema las tomo, las de SALIDA. Cada paso puede tener varias (la
 * camara principal y las de apoyo): se ven todas, una grande y las demas en una
 * tira para pasar de una a otra.
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
  photos,
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
  /** Todas las fotos del tiquete, con su camara. Sin ellas, `src` y `exitSrc`. */
  photos?: TicketPhoto[];
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
  const [abierta, setAbierta] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);

  /*
    Carga de la miniatura. Fallaba de dos formas que dejaban un recuadro en blanco
    o el icono de imagen rota del navegador:
      - La pagina llega armada del servidor y la imagen empieza a cargar ANTES de
        que React se conecte. Si fallaba en ese instante, el `onError` no existia
        todavia y nadie se enteraba. Por eso al montar se mira la imagen misma.
      - Un fallo pasajero (el tunel, la base ocupada) era definitivo. Ahora se
        reintenta dos veces con una pausa, y si aun asi no carga se vuelve a
        intentar al cerrar el visor, cuando la foto ya quedo en el navegador.
  */
  const imagen = useRef<HTMLImageElement>(null);
  const [carga, setCarga] = useState<'cargando' | 'lista' | 'falla'>('cargando');
  const [intento, setIntento] = useState(0);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alFallar = useCallback(() => {
    if (reintento.current) return;
    if (intento >= REINTENTOS_MINIATURA) {
      setCarga('falla');
      return;
    }
    reintento.current = setTimeout(() => {
      reintento.current = null;
      setCarga('cargando');
      setIntento((n) => n + 1);
    }, 1_200 * (intento + 1));
  }, [intento]);

  useEffect(() => () => {
    if (reintento.current) clearTimeout(reintento.current);
  }, []);

  // La imagen ya pudo cargar o fallar antes de que React se conectara.
  useEffect(() => {
    const img = imagen.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) setCarga('lista');
    else alFallar();
  }, [intento, alFallar]);

  const cerrar = useCallback(() => {
    setAbierta(false);
    // Si la miniatura no habia cargado, ahora la foto ya esta en el navegador.
    if (carga === 'falla') {
      setCarga('cargando');
      setIntento((n) => n + 1);
    }
    // El foco vuelve a la miniatura: quien usa teclado sigue donde estaba.
    requestAnimationFrame(() => disparador.current?.focus());
  }, [carga]);

  const caja = size === 'wide' ? 'h-20 w-32 rounded-xl' : 'h-11 w-16 rounded-lg';

  // Sin la lista (pantallas que solo conocen una por tipo), se arma con las dos.
  const todas: TicketPhoto[] =
    photos && photos.length > 0
      ? photos
      : [
          ...(src ? [{ src, kind: 'entrada' as const, camera: 'Cámara de entrada' }] : []),
          ...(exitSrc ? [{ src: exitSrc, kind: 'salida' as const, camera: 'Cámara de salida' }] : []),
        ];
  const entradas = todas.filter((f) => f.kind === 'entrada');
  const salidas = todas.filter((f) => f.kind === 'salida');
  const miniatura = entradas[0]?.src ?? salidas[0]?.src ?? null;

  if (!miniatura) {
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

  const conSalida = salidas.length > 0;

  return (
    <>
      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierta(true)}
        aria-haspopup="dialog"
        title={
          conSalida
            ? 'Ver fotos de entrada y salida'
            : todas.length > 1
              ? 'Ver las fotos de entrada'
              : 'Ver la foto de entrada'
        }
        className={`group relative block ${caja} overflow-hidden bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--line-subtle)] transition-shadow duration-150 hover:ring-2 hover:ring-brand-400`}
      >
        {carga === 'cargando' ? (
          <span className="absolute inset-0 animate-pulse bg-[var(--fill-soft)]" aria-hidden />
        ) : null}
        {carga === 'falla' ? (
          // Las fotos existen (el visor las intenta): un icono limpio, no la imagen rota.
          <span className="absolute inset-0 flex items-center justify-center bg-[var(--fill-soft)] text-[var(--text-muted)]">
            <MdNoPhotography className="h-4 w-4" aria-hidden focusable="false" />
            <span className="sr-only">La foto no cargó; toca para verla</span>
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- la sirve nuestra
             propia ruta; pasarla por el optimizador de Next la volveria a
             descargar por el tunel en cada tamano. */
          <img
            // Cada reintento es otra URL: el navegador no reusa el fallo.
            key={intento}
            ref={imagen}
            src={`${urlDe(slug, miniatura)}${intento > 0 ? `&intento=${intento}` : ''}`}
            alt={`${entradas.length > 0 ? 'Entrada' : 'Salida'} de ${label}`}
            loading="lazy"
            onLoad={() => setCarga('lista')}
            onError={alFallar}
            className={`h-full w-full object-cover transition-[transform,opacity] duration-200 group-hover:scale-[1.04] ${
              carga === 'lista' ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {todas.length > 1 ? (
          <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-ink-950/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            <MdPhotoLibrary className="h-3 w-3" aria-hidden focusable="false" />
            {todas.length}
            <span className="sr-only">
              {' '}fotos{conSalida ? ': de entrada y de salida' : ' de entrada'}
            </span>
          </span>
        ) : null}
      </button>

      {abierta ? (
        <PhotoViewer
          slug={slug}
          label={label}
          entradas={entradas}
          salidas={salidas}
          enteredAt={enteredAt}
          exitedAt={exitedAt}
          inside={inside}
          onClose={cerrar}
        />
      ) : null}
    </>
  );
}

/** Reintentos solos de una miniatura antes de dejar el icono de "no cargo". */
const REINTENTOS_MINIATURA = 2;

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
  entradas,
  salidas,
  enteredAt,
  exitedAt,
  inside,
  onClose,
}: {
  slug: string;
  label: string;
  entradas: TicketPhoto[];
  salidas: TicketPhoto[];
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
                {dosFotos
                  ? 'Fotos de las cámaras de entrada y salida'
                  : entradas.length > 1
                    ? 'Fotos de las cámaras de entrada'
                    : 'Foto de la cámara de entrada'}
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
            <ShotGroup
              kind="entrada"
              fotos={entradas}
              slug={slug}
              when={hora(enteredAt)}
              label={label}
              tall={!dosFotos}
              emptyTitle="Sin foto de entrada"
              emptyHint="La cámara de entrada no tomó foto de este vehículo."
            />
            {dosFotos ? (
              <ShotGroup
                kind="salida"
                fotos={salidas}
                slug={slug}
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

/**
 * Las fotos de un paso (entrada o salida): una grande y, si hay mas de una
 * camara, una tira de miniaturas para cambiar. Arranca en la camara principal.
 */
function ShotGroup({
  kind,
  fotos,
  slug,
  when,
  label,
  tall = false,
  emptyTitle,
  emptyHint,
}: {
  kind: 'entrada' | 'salida';
  fotos: TicketPhoto[];
  slug: string;
  when: string | null;
  label: string;
  tall?: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  const [indice, setIndice] = useState(0);
  const actual = fotos[Math.min(indice, fotos.length - 1)] ?? null;
  const paso = kind === 'entrada' ? 'entrada' : 'salida';

  return (
    <div className="min-w-0">
      <Shot
        // Una foto nueva vuelve a "cargando": el estado de la anterior no le sirve.
        key={actual?.src ?? 'vacia'}
        kind={kind}
        url={actual ? urlDe(slug, actual.src) : null}
        when={when}
        camera={fotos.length > 1 && actual ? `${actual.camera} · ${indice + 1} de ${fotos.length}` : actual?.camera ?? null}
        label={label}
        tall={tall}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
      />
      {fotos.length > 1 ? (
        <div role="group" aria-label={`Cámaras de ${paso}`} className="mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
          {fotos.map((foto, i) => (
            <button
              key={foto.src}
              type="button"
              onClick={() => setIndice(i)}
              aria-pressed={i === indice}
              aria-label={`${foto.camera} (${paso})`}
              title={foto.camera}
              className={`relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)] ring-inset transition-shadow duration-150 ${
                i === indice ? 'ring-2 ring-brand-500' : 'ring-1 ring-[var(--line-subtle)] hover:ring-2 hover:ring-brand-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- misma razon que la miniatura. */}
              {/* Sin `lazy`: dentro de una tira que se desplaza de lado, las de la
                  derecha no cargaban hasta moverla. Son pocas y pequenas. */}
              <img src={urlDe(slug, foto.src)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Una foto con su encabezado (entrada o salida, la camara y la hora). */
function Shot({
  kind,
  url,
  when,
  camera = null,
  label,
  tall = false,
  emptyTitle,
  emptyHint,
}: {
  kind: 'entrada' | 'salida';
  url: string | null;
  when: string | null;
  /** Camara que la tomo, cuando el paso tiene varias. */
  camera?: string | null;
  label: string;
  tall?: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'falla'>('cargando');
  /** Cada reintento pide la foto de nuevo (el navegador no reusa el fallo). */
  const [intento, setIntento] = useState(0);
  const urlPedida = url && intento > 0 ? `${url}&intento=${intento}` : url;
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
              {camera ? ` · ${camera}` : ''}
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
              src={urlPedida ?? url}
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
              {estado === 'falla' ? 'El sistema del parqueadero no la entregó a tiempo.' : emptyHint}
            </p>
            {estado === 'falla' && url ? (
              <button
                type="button"
                onClick={() => {
                  setIntento((n) => n + 1);
                  setEstado('cargando');
                }}
                className="mt-1 rounded-full px-4 py-1.5 text-[13px] font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)]"
              >
                Reintentar
              </button>
            ) : null}
          </div>
        )}
      </div>
    </figure>
  );
}
