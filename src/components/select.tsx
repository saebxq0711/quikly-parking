'use client';

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { MdCheck, MdExpandMore } from 'react-icons/md';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Local y no importado de `ui.tsx`: `ui.tsx` reexporta este componente.
const cn = (...clases: ClassValue[]) => twMerge(clsx(clases));

/**
 * Lista desplegable con diseno propio, en vez del menu nativo del navegador.
 *
 * Se usa igual que un `<select>`: hijos `<option>`, `name` para el formulario,
 * `defaultValue` o `value` + `onChange`. Por dentro es un boton con una lista
 * (`role="listbox"`) que se abre en una capa sobre la pagina, asi no la recortan las
 * tarjetas. Se maneja con teclado (flechas, Inicio/Fin, Enter, Escape y primera letra)
 * y lleva un campo oculto con el valor para que el formulario lo envie y el navegador
 * pueda exigirlo con `required`.
 */

interface Opcion {
  value: string;
  label: string;
  disabled: boolean;
}

export interface SelectChangeEvent {
  target: { value: string; name?: string };
  currentTarget: { value: string; name?: string };
}

function leerOpciones(children: React.ReactNode): Opcion[] {
  return Children.toArray(children).flatMap((hijo) => {
    if (!isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(hijo) || hijo.type !== 'option') {
      return [];
    }
    const label = Children.toArray(hijo.props.children).join('');
    return [
      {
        value: hijo.props.value !== undefined ? String(hijo.props.value) : label,
        label,
        disabled: Boolean(hijo.props.disabled),
      },
    ];
  });
}

export function Select({
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  id,
  children,
  'aria-label': ariaLabel,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: SelectChangeEvent) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  const opciones = leerOpciones(children);
  const [interno, setInterno] = useState(defaultValue ?? opciones[0]?.value ?? '');
  const actual = value ?? interno;
  const seleccionada = opciones.find((opcion) => opcion.value === actual);

  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);

  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();
  const idBase = useId();

  const elegir = useCallback(
    (opcion: Opcion) => {
      if (opcion.disabled) return;
      if (value === undefined) setInterno(opcion.value);
      onChange?.({
        target: { value: opcion.value, name },
        currentTarget: { value: opcion.value, name },
      });
      setAbierto(false);
      boton.current?.focus();
    },
    [name, onChange, value],
  );

  const abrir = () => {
    if (disabled) return;
    const indice = opciones.findIndex((opcion) => opcion.value === actual);
    setActivo(indice >= 0 ? indice : Math.max(0, opciones.findIndex((opcion) => !opcion.disabled)));
    setAbierto(true);
  };

  // Posicion de la capa: debajo del boton, o arriba si abajo no cabe.
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const medir = () => {
      const caja = boton.current!.getBoundingClientRect();
      const alto = Math.min(280, opciones.length * 40 + 12);
      const arriba = window.innerHeight - caja.bottom < alto + 12 && caja.top > alto + 12;
      setPosicion({
        top: arriba ? caja.top - 6 : caja.bottom + 6,
        left: caja.left,
        width: caja.width,
        arriba,
      });
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [abierto, opciones.length]);

  useEffect(() => {
    if (!abierto) return;
    lista.current?.focus();
    const fuera = (event: PointerEvent) => {
      const objetivo = event.target as Node;
      if (!lista.current?.contains(objetivo) && !boton.current?.contains(objetivo)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  // La opcion activa siempre a la vista al moverse con el teclado.
  useEffect(() => {
    if (!abierto) return;
    lista.current
      ?.querySelector<HTMLElement>(`[data-indice="${activo}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activo]);

  const mover = (paso: number) => {
    if (opciones.length === 0) return;
    let siguiente = activo;
    for (let intento = 0; intento < opciones.length; intento++) {
      siguiente = (siguiente + paso + opciones.length) % opciones.length;
      if (!opciones[siguiente].disabled) break;
    }
    setActivo(siguiente);
  };

  const teclaLista = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mover(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      mover(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActivo(Math.max(0, opciones.findIndex((opcion) => !opcion.disabled)));
    } else if (event.key === 'End') {
      event.preventDefault();
      for (let i = opciones.length - 1; i >= 0; i--) {
        if (!opciones[i].disabled) {
          setActivo(i);
          break;
        }
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const opcion = opciones[activo];
      if (opcion) elegir(opcion);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setAbierto(false);
      boton.current?.focus();
    } else if (event.key === 'Tab') {
      setAbierto(false);
    } else if (event.key.length === 1) {
      const letra = event.key.toLowerCase();
      const encontrada = opciones.findIndex(
        (opcion, indice) => indice > activo && !opcion.disabled && opcion.label.toLowerCase().startsWith(letra),
      );
      const desdeInicio = opciones.findIndex(
        (opcion) => !opcion.disabled && opcion.label.toLowerCase().startsWith(letra),
      );
      const indice = encontrada >= 0 ? encontrada : desdeInicio;
      if (indice >= 0) setActivo(indice);
    }
  };

  const vacia = !seleccionada || (seleccionada.value === '' && seleccionada.disabled);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={boton}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-label={ariaLabel}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            abrir();
          }
        }}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5 text-left text-sm',
          'ring-1 ring-inset transition-[box-shadow,background-color] duration-150',
          abierto ? 'ring-2 ring-brand-500' : 'ring-white/10 hover:ring-white/20',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          'disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-ink-500',
        )}
      >
        <span className={cn('truncate', vacia ? 'text-[var(--text-muted)]' : 'text-ink-100')}>
          {seleccionada?.label || 'Elegir'}
        </span>
        <MdExpandMore
          className={cn(
            'h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-200',
            abierto && 'rotate-180 text-brand-300',
          )}
          aria-hidden
          focusable="false"
        />
      </button>

      {/*
        Valor para el formulario. Es un campo de texto invisible y no `type="hidden"`
        porque los ocultos no participan de la validacion: asi `required` funciona y el
        navegador senala este campo si quedo vacio.
      */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={actual}
        required={required}
        onChange={() => undefined}
        onFocus={() => boton.current?.focus()}
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
      />

      {abierto && posicion
        ? createPortal(
            <ul
              ref={lista}
              id={idLista}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={`${idBase}-${activo}`}
              onKeyDown={teclaLista}
              style={{
                position: 'fixed',
                left: posicion.left,
                width: Math.max(posicion.width, 180),
                ...(posicion.arriba
                  ? { bottom: window.innerHeight - posicion.top }
                  : { top: posicion.top }),
              }}
              className="select-in z-[70] max-h-[280px] overflow-y-auto rounded-xl bg-[var(--surface-raised)] p-1 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.75)] ring-1 ring-[var(--line-strong)] focus:outline-none"
            >
              {opciones.map((opcion, indice) => {
                const elegida = opcion.value === actual;
                return (
                  <li
                    key={`${opcion.value}-${indice}`}
                    id={`${idBase}-${indice}`}
                    data-indice={indice}
                    role="option"
                    aria-selected={elegida}
                    aria-disabled={opcion.disabled || undefined}
                    onPointerEnter={() => !opcion.disabled && setActivo(indice)}
                    onClick={() => elegir(opcion)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-100',
                      opcion.disabled
                        ? 'cursor-default text-[var(--text-muted)]'
                        : indice === activo
                          ? 'bg-brand-500/15 text-ink-50'
                          : 'text-ink-200',
                    )}
                  >
                    <span className="truncate">{opcion.label}</span>
                    {elegida && !opcion.disabled ? (
                      <MdCheck className="h-4 w-4 shrink-0 text-brand-300" aria-hidden focusable="false" />
                    ) : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
