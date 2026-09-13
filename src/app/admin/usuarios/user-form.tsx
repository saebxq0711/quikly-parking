'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Alert, Field, Input, Select } from '@/components/ui';
import { createUser } from '../actions';

interface LotOption {
  id: string;
  name: string;
  hasPaymentPoint: boolean;
}

/**
 * Alta de usuario.
 *
 * El punto de pago NO se pregunta: cada parqueadero tiene uno solo, asi que se
 * asigna solo. Pedirlo seria hacer elegir algo que no tiene alternativa.
 */
export function UserForm({ parkingLots }: { parkingLots: LotOption[] }) {
  const [role, setRole] = useState('PUNTO_PAGO');
  const [lotId, setLotId] = useState(parkingLots[0]?.id ?? '');

  const needsLot = role !== 'SUPERADMIN';
  const lot = parkingLots.find((l) => l.id === lotId);
  const blockedByPoint =
    role === 'PUNTO_PAGO' && lot !== undefined && !lot.hasPaymentPoint;

  return (
    <ActionForm action={createUser} submitLabel="Crear usuario">
      <Field label="Nombre completo">
        <Input name="name" required placeholder="Maria Rodriguez" />
      </Field>

      <Field label="Correo electronico">
        <Input
          name="email"
          type="email"
          required
          placeholder="usuario@parqueadero.com"
        />
      </Field>

      <Field
        label="Contrasena inicial"
        hint="Minimo 10 caracteres, con mayusculas, minusculas y numeros. Debera cambiarla al entrar."
      >
        <Input name="password" type="text" required autoComplete="off" />
      </Field>

      <Field label="Rol">
        <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="PUNTO_PAGO">Punto de pago</option>
          <option value="ADMIN_PARQUEADERO">Administrador de parqueadero</option>
          <option value="SUPERADMIN">Super administrador</option>
        </Select>
      </Field>

      {needsLot ? (
        <Field
          label="Parqueadero"
          hint={
            role === 'PUNTO_PAGO'
              ? 'Se asigna solo al punto de pago de ese sitio.'
              : undefined
          }
        >
          <Select
            name="parkingLotId"
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            required
          >
            <option value="">Selecciona un parqueadero</option>
            {parkingLots.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {blockedByPoint ? (
        <Alert tone="warning">
          Ese parqueadero no tiene punto de pago configurado, asi que todavia no
          puede tener un usuario de caja.
        </Alert>
      ) : null}
    </ActionForm>
  );
}
