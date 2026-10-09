'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Field, Input, Select } from '@/components/ui';
import { PasswordInput } from '@/components/password-input';
import { createUser } from '../actions';

interface LotOption {
  id: string;
  name: string;
}

/**
 * Alta de administradores y super administradores.
 *
 * Primero el rol y el parqueadero, porque deciden lo demas; despues la persona y
 * su contrasena. Los usuarios de kiosco no se crean aqui: nacen con su kiosco, en
 * la ficha del parqueadero, porque cada uno opera un solo kiosco con su datafono.
 */
export function UserForm({ parkingLots }: { parkingLots: LotOption[] }) {
  const [role, setRole] = useState('ADMIN_PARQUEADERO');

  return (
    <ActionForm action={createUser} submitLabel="Crear usuario" submitVariant="confirm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rol">
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ADMIN_PARQUEADERO">Administrador de parqueadero</option>
            <option value="SUPERADMIN">Super administrador</option>
          </Select>
        </Field>

        {role !== 'SUPERADMIN' ? (
          <Field label="Parqueadero">
            <Select name="parkingLotId" required defaultValue="">
              <option value="" disabled>
                Elige un parqueadero
              </option>
              {parkingLots.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="self-end pb-2.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
            Ve y configura todos los parqueaderos.
          </p>
        )}

        <Field label="Nombre completo">
          <Input name="name" required minLength={3} placeholder="María Rodríguez" autoComplete="off" />
        </Field>

        <Field label="Correo">
          <Input name="email" type="email" required placeholder="usuario@parqueadero.co" autoComplete="off" />
        </Field>

        <Field label="Contraseña" hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números.">
          <PasswordInput name="password" required minLength={10} autoComplete="new-password" />
        </Field>

        <Field label="Confirma la contraseña">
          <PasswordInput name="confirmPassword" required minLength={10} autoComplete="new-password" />
        </Field>
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">Entrégale su correo y su contraseña por tu canal habitual.</p>
    </ActionForm>
  );
}
