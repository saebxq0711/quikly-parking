'use client';

import { useState } from 'react';
import { Field, Input } from '@/components/ui';
import { FormSection } from './lot-fields';

/**
 * Nombre e identificador del parqueadero.
 *
 * El identificador va en la direccion de sus kioscos y de su panel, asi que se
 * propone solo a partir del nombre (minusculas, numeros y guiones, lo unico que
 * acepta `parkingLotSchema`) y se muestra la direccion que va a quedar mientras se
 * escribe. Si alguien lo edita a mano, deja de seguir al nombre.
 */
export function IdentityFields({
  baseUrl,
  name: nombreInicial = '',
  slug: slugInicial = '',
}: {
  /** Dominio de la plataforma, sin protocolo. */
  baseUrl: string;
  name?: string;
  slug?: string;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [slug, setSlug] = useState(slugInicial);
  const [aMano, setAMano] = useState(Boolean(slugInicial));

  return (
    <FormSection
      title="El parqueadero"
      description="Cómo se llama y en qué dirección entran sus kioscos y su panel."
    >
      <Field label="Nombre">
        <Input
          name="name"
          required
          minLength={3}
          value={nombre}
          onChange={(event) => {
            setNombre(event.target.value);
            if (!aMano) setSlug(aIdentificador(event.target.value));
          }}
          placeholder="Ej.: Parqueadero Centro"
        />
      </Field>
      <Field label="Identificador" hint="Minúsculas, números y guiones. Cambiarlo después cambia la dirección de los kioscos.">
        <Input
          name="slug"
          required
          maxLength={40}
          pattern="[a-z0-9\-]+"
          value={slug}
          onChange={(event) => {
            setAMano(true);
            setSlug(aIdentificador(event.target.value, false));
          }}
          placeholder="Ej.: centro"
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
      <p className="rounded-xl bg-[var(--fill-soft)] px-4 py-3 text-[13px] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line-subtle)]">
        Los kioscos entrarán en{' '}
        <span className="tnum break-all font-semibold text-[var(--text-primary)]">
          {baseUrl}/p/{slug || 'identificador'}/pos
        </span>
      </p>
    </FormSection>
  );
}

/** "Parqueadero Centro 122" -> "parqueadero-centro-122". */
function aIdentificador(texto: string, recortarGuiones = true): string {
  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
  return recortarGuiones ? limpio.replace(/^-|-$/g, '') : limpio.replace(/^-/, '');
}
