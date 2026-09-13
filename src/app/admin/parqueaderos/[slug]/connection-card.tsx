'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionForm } from '@/components/action-form';
import { Alert, Card, CardHeader, Field, Input } from '@/components/ui';
import { testNovaConnection, updateParkingConnection } from '../../actions';

/**
 * Conexion con el sistema de ESTE parqueadero.
 *
 * De ahi salen el vehiculo y el valor a cobrar. Cada parqueadero es un
 * despliegue distinto, con su propio dominio y su propia llave, asi que se
 * configura por sitio: agregar uno nuevo no puede exigir un despliegue.
 */
export function ConnectionCard({
  parkingLotId,
  baseUrl,
  hasOwnToken,
}: {
  parkingLotId: string;
  baseUrl: string | null;
  hasOwnToken: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Sistema del parqueadero"
        description="De aqui se obtienen el vehiculo y el valor a cobrar, y aqui se confirma el pago."
      />

      <div className="space-y-5 p-5">
        {baseUrl ? (
          <>
            <div className="rounded-lg bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                Apuntando a
              </p>
              <p className="mt-1 break-all font-mono text-[13px] text-ink-100">
                {baseUrl}
              </p>
              <p
                className={`mt-2 text-xs ${hasOwnToken ? 'text-ok-300' : 'text-warn-300'}`}
              >
                {hasOwnToken
                  ? 'Token configurado'
                  : 'Sin token: el sistema rechazara las consultas'}
              </p>
            </div>

            <TestConnection parkingLotId={parkingLotId} />
          </>
        ) : (
          <Alert tone="warning" title="Sin conexion configurada">
            Este parqueadero no puede consultar vehiculos todavia. Pide a quien
            opera ese sistema el dominio publico y el token de acceso.
          </Alert>
        )}

        <div className="border-t border-[var(--line-subtle)] pt-5">
          <ActionForm
            action={updateParkingConnection}
            submitLabel="Guardar conexion"
            onSuccessReset={false}
          >
            <input type="hidden" name="parkingLotId" value={parkingLotId} />

            <Field
              label="Dominio del sistema"
              hint="La direccion publica por la que se llega a ese parqueadero, con https://"
            >
              <Input
                name="novaBaseUrl"
                defaultValue={baseUrl ?? ''}
                placeholder="https://api.miparqueadero.com"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <Field
              label="Token de acceso"
              hint={
                hasOwnToken
                  ? 'Ya hay uno guardado. Dejalo vacio para conservarlo.'
                  : 'Lo entrega quien opera ese sistema. Se guarda cifrado y no vuelve a mostrarse.'
              }
            >
              <Input
                name="platformToken"
                type="password"
                placeholder={hasOwnToken ? 'Sin cambios' : 'Pega aqui el token'}
                autoComplete="new-password"
              />
            </Field>
          </ActionForm>
        </div>
      </div>
    </Card>
  );
}

function TestConnection({ parkingLotId }: { parkingLotId: string }) {
  const [state, formAction] = useActionState(testNovaConnection, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="parkingLotId" value={parkingLotId} />
      <TestButton />
      {state ? (
        <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}
    </form>
  );
}

function TestButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/[0.04] px-4 text-[13px] font-semibold text-ink-100 ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:ring-white/20 disabled:opacity-50"
    >
      {pending ? 'Probando...' : 'Probar conexion'}
    </button>
  );
}
