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
 * Alta de administradores.
 *
 * Los usuarios de kiosco no se crean aqui: nacen con su kiosco, en la ficha del
 * parqueadero, porque cada uno opera un solo kiosco con su propio datafono.
 */
export function UserForm({ parkingLots }: { parkingLots: LotOption[] }) {
  const [role, setRole] = useState('ADMIN_PARQUEADERO');

  return (
    <ActionForm action={createUser} submitLabel="Crear usuario">
      <Field label="Nombre completo">
        <Input name="name" required placeholder="Maria Rodriguez" />
      </Field>

      <Field label="Correo electronico">
        <Input name="email" type="email" required placeholder="usuario@parqueadero.com" />
      </Field>

      <Field label="Contrasena" hint="Minimo 10 caracteres, con mayusculas, minusculas y numeros.">
        <PasswordInput name="password" required minLength={10} autoComplete="new-password" />
      </Field>

      <Field label="Confirma la contrasena">
        <PasswordInput name="confirmPassword" required minLength={10} autoComplete="new-password" />
      </Field>

      <Field label="Rol" hint="Los usuarios de kiosco se crean en la ficha del parqueadero.">
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
      ) : null}
    </ActionForm>
  );
}
