'use client';

import { useState } from 'react';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Campo de contrasena con boton para verla u ocultarla.
 *
 * Mismo aspecto que `Input` de `ui.tsx`, con el ojo dentro del campo a la derecha. El
 * boton es `type="button"` para que no envie el formulario, y no toma el foco con
 * Tab al pasar de un campo a otro... salvo que se quiera: es alcanzable pero va
 * despues del campo.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={twMerge(
          clsx(
            'block w-full rounded-lg border-0 bg-[var(--surface-sunken)] py-2.5 pl-3 pr-11 text-sm text-ink-100',
            'ring-1 ring-inset ring-white/10 placeholder:text-[var(--text-muted)]',
            'transition-shadow duration-150 hover:ring-white/20',
            'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500',
            className,
          ),
        )}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contrasena' : 'Ver contrasena'}
        title={visible ? 'Ocultar contrasena' : 'Ver contrasena'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-[var(--text-muted)] transition-colors duration-150 hover:text-ink-100"
      >
        {visible ? (
          <MdVisibilityOff className="h-4.5 w-4.5" aria-hidden focusable="false" />
        ) : (
          <MdVisibility className="h-4.5 w-4.5" aria-hidden focusable="false" />
        )}
      </button>
    </div>
  );
}
