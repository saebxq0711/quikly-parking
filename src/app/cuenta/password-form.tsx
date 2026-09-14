'use client';

import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/ui';
import { PasswordInput } from '@/components/password-input';
import { changeOwnPassword } from './actions';

export function PasswordForm() {
  return (
    <ActionForm action={changeOwnPassword} submitLabel="Cambiar contrasena">
      <Field label="Contrasena actual">
        <PasswordInput name="currentPassword" required autoComplete="current-password" />
      </Field>
      <Field
        label="Nueva contrasena"
        hint="Al menos 10 caracteres, con mayusculas, minusculas y un numero."
      >
        <PasswordInput name="newPassword" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirma la nueva contrasena">
        <PasswordInput name="confirmPassword" required minLength={10} autoComplete="new-password" />
      </Field>
    </ActionForm>
  );
}
