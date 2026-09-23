'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MdCalendarToday,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
} from 'react-icons/md';

/**
 * Campo de fecha con calendario propio, en vez del `<input type="date">` nativo.
 *
 * El nativo se ve distinto en cada navegador (y en Windows es una caja gris con
 * `aaaa-mm-dd` y una flechita diminuta), no se puede alinear con el resto de los
 * controles, y obliga a escribir la fecha en formato ISO — justo al reves de
 * como la dice todo el mundo aqui. Este muestra "23 sep 2026", abre un mes
 * completo y se opera con un toque.
 *
 * Por fuera se comporta como el campo nativo: guarda `AAAA-MM-DD` en un campo
 * oculto con el mismo `name`, asi que los formularios que lo leen con `FormData`
 * no cambian nada. `min` y `max` tambien se respetan (Reportes limita a hoy).
 *
 * La semana empieza en LUNES, como los calendarios de pared en Colombia.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const MES_CORTO = MESES.map((mes) => mes.slice(0, 3));
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `AAAA-MM-DD` -> partes numericas, sin pasar por `Date` (que interpreta UTC). */
function partes(iso: string): { anio: number; mes: number; dia: number } | null {
  if (!ISO.test(iso)) return null;
  const [anio, mes, dia] = iso.split('-').map(Number);
  return { anio, mes: mes - 1, dia };
}

function aIso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function hoyIso(): string {
  const ahora = new Date();
  return aIso(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

function bonita(iso: string): string {
  const p = partes(iso);
  return p ? `${p.dia} ${MES_CORTO[p.mes]} ${p.anio}` : '';
}

/** Lunes = 0. `getDay()` cuenta desde el domingo. */
function primerDiaSemana(anio: number, mes: number): number {
  return (new Date(anio, mes, 1).getDay() + 6) % 7;
}

export function DateField({
  name,
  defaultValue = '',
  min,
  max,
  required = false,
  label,
  className,
}: {
  name: string;
  defaultValue?: string;
  /** Limites en `AAAA-MM-DD`, igual que en el campo nativo. */
  min?: string;
  max?: string;
  required?: boolean;
  /** Para lectores de pantalla cuando la etiqueta visible esta fuera. */
  label?: string;
  className?: string;
}) {
  const [valor, setValor] = useState(ISO.test(defaultValue) ? defaultValue : '');
  const [abierto, setAbierto] = useState(false);

  const inicial = partes(valor) ?? partes(hoyIso())!;
  const [mes, setMes] = useState(inicial.mes);
  const [anio, setAnio] = useState(inicial.anio);

  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera o con Escape: lo que espera cualquiera que abra algo.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (event: MouseEvent) => {
      if (!caja.current?.contains(event.target as Node)) setAbierto(false);
    };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function abrir() {
    const p = partes(valor) ?? partes(hoyIso())!;
    setMes(p.mes);
    setAnio(p.anio);
    setAbierto(true);
  }

  function elegir(dia: number) {
    setValor(aIso(anio, mes, dia));
    setAbierto(false);
  }

  function mover(pasos: number) {
    const siguiente = mes + pasos;
    setMes((siguiente + 12) % 12);
    if (siguiente < 0) setAnio(anio - 1);
    if (siguiente > 11) setAnio(anio + 1);
  }

  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const hueco = primerDiaSemana(anio, mes);
  const hoy = hoyIso();

  const fueraDeRango = (iso: string) =>
    (min !== undefined && min !== '' && iso < min) ||
    (max !== undefined && max !== '' && iso > max);

  return (
    <div ref={caja} className={`relative ${className ?? ''}`}>
      {/*
        El valor real que envia el formulario. No lleva `required`: un campo que
        no se puede enfocar hace que Chrome aborte el envio con "invalid form
        control is not focusable" y sin decirle nada al usuario. Lo obligatorio
        se comprueba en el formulario, que es quien puede explicarlo.
      */}
      <input
        type="text"
        name={name}
        value={valor}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 left-4 h-0 w-0 opacity-0"
      />

      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={label ?? 'Elegir fecha'}
        aria-required={required || undefined}
        className={`flex w-full items-center gap-2.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5 text-left text-sm ring-1 ring-inset transition-shadow duration-150 hover:ring-[var(--ring-strong)] ${
          abierto ? 'ring-2 ring-brand-500' : 'ring-[var(--ring-soft)]'
        }`}
      >
        <MdCalendarToday
          className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
          aria-hidden
          focusable="false"
        />
        <span
          className={`flex-1 truncate ${
            valor ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {valor ? bonita(valor) : 'Cualquier fecha'}
        </span>
        {valor ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Quitar la fecha"
            onClick={(event) => {
              event.stopPropagation();
              setValor('');
              setAbierto(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setValor('');
              }
            }}
            className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text-primary)]"
          >
            <MdClose className="h-4 w-4" aria-hidden focusable="false" />
          </span>
        ) : null}
      </button>

      {abierto ? (
        <div
          role="dialog"
          aria-label="Calendario"
          className="select-in absolute left-0 top-full z-40 mt-2 w-72 rounded-xl bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-card)] ring-1 ring-[var(--line-strong)]"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => mover(-1)}
              aria-label="Mes anterior"
              className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] hover:text-[var(--text-primary)]"
            >
              <MdChevronLeft className="h-5 w-5" aria-hidden focusable="false" />
            </button>
            <p className="text-sm font-semibold capitalize text-[var(--text-primary)]">
              {MESES[mes]} {anio}
            </p>
            <button
              type="button"
              onClick={() => mover(1)}
              aria-label="Mes siguiente"
              className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] hover:text-[var(--text-primary)]"
            >
              <MdChevronRight className="h-5 w-5" aria-hidden focusable="false" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-[var(--text-muted)]">
            {DIAS.map((dia, indice) => (
              <span key={`${dia}-${indice}`}>{dia}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: hueco }, (_, i) => (
              <span key={`hueco-${i}`} />
            ))}
            {Array.from({ length: diasDelMes }, (_, i) => {
              const dia = i + 1;
              const iso = aIso(anio, mes, dia);
              const elegido = iso === valor;
              const esHoy = iso === hoy;
              const bloqueado = fueraDeRango(iso);

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => elegir(dia)}
                  aria-current={esHoy ? 'date' : undefined}
                  className={`tnum h-8 rounded-lg text-[13px] font-medium transition-colors duration-100 ${
                    elegido
                      ? 'bg-brand-600 text-white'
                      : bloqueado
                        ? 'text-[var(--text-muted)] opacity-40'
                        : esHoy
                          ? 'bg-[var(--fill-soft)] text-brand-300 ring-1 ring-inset ring-brand-400/40 day:text-brand-700'
                          : 'text-[var(--text-primary)] hover:bg-[var(--fill-soft-hover)]'
                  }`}
                >
                  {dia}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2 border-t border-[var(--line-subtle)] pt-3">
            <button
              type="button"
              disabled={fueraDeRango(hoy)}
              onClick={() => {
                setValor(hoy);
                setAbierto(false);
              }}
              className="flex-1 rounded-lg bg-[var(--fill-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] disabled:opacity-40"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                setValor('');
                setAbierto(false);
              }}
              className="flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] hover:text-[var(--text-primary)]"
            >
              Limpiar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
