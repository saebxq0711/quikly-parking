'use client';

import { ActionForm } from '@/components/action-form';
import { Field, Input } from '@/components/ui';
import { changeOwnPassword } from './actions';

export function PasswordForm() {
  return (
    <ActionForm action={changeOwnPassword} submitLabel="Cambiar contrasena">
      <Field label="Contrasena actual">
        <Input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field
        label="Nueva contrasena"
        hint="Al menos 10 caracteres, con mayusculas, minusculas y un numero."
      >
        <Input name="newPassword" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirma la nueva contrasena">
        <Input
          name="confirmPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </Field>
    </ActionForm>
  );
}
