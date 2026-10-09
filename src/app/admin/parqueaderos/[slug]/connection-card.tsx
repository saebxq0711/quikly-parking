'use client';

import { useActionState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Alert, Card, CardHeader, Checkbox, Field, Input } from '@/components/ui';
import { setParkingTestMode, testNovaConnection, updateParkingConnection } from '../../actions';
import { StatusPill, TestButton } from './redeban-card';
import { EditableBlock } from '@/components/admin/editable-block';

/**
 * Conexion con el sistema de ESTE parqueadero: su dominio y su token.
 *
 * De ahi salen el vehiculo y el valor a cobrar, y ahi se confirma el pago. El modo de
 * pruebas cambia ese sistema por uno simulado sin borrar la conexion real.
 */
export function ConnectionCard({
  parkingLotId,
  baseUrl,
  hasOwnToken,
  testMode,
}: {
  parkingLotId: string;
  baseUrl: string | null;
  hasOwnToken: boolean;
  testMode: boolean;
}) {
  const listo = Boolean(baseUrl && hasOwnToken);

  return (
    <Card>
      <CardHeader
        title="Sistema del parqueadero"
        description="El servidor del parqueadero: de ahí salen el vehículo y el valor a cobrar."
        action={<StatusPill ok={listo} />}
      />

      <div className="space-y-5 p-5">
        {testMode ? (
          <Alert tone="warning" title="Modo de pruebas activo">
            El kiosco usa un parqueadero simulado. Redeban y SIIGO siguen siendo reales, en
            sus ambientes de prueba.
          </Alert>
        ) : null}

        <EditableBlock
          defaultOpen={!listo}
          aside={listo && !testMode ? <TestConnection parkingLotId={parkingLotId} /> : null}
          summary={[
            { label: 'Dirección del sistema', value: baseUrl ?? 'Falta', missing: !baseUrl, tabular: Boolean(baseUrl) },
            { label: 'Token de acceso', value: hasOwnToken ? 'Guardado' : 'Falta', missing: !hasOwnToken },
            { label: 'Modo', value: testMode ? 'Pruebas (sistema simulado)' : 'Real' },
          ]}
        >
        <ActionForm submitVariant="confirm"
          action={updateParkingConnection}
          submitLabel="Guardar conexión"
          onSuccessReset={false}
        >
          <input type="hidden" name="parkingLotId" value={parkingLotId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dirección del sistema" hint="Con https://">
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
              hint={hasOwnToken ? 'Guardado. Déjalo vacío para conservarlo.' : 'Lo entrega quien opera ese sistema.'}
            >
              <Input
                name="platformToken"
                type="password"
                placeholder={hasOwnToken ? '••••••••' : 'Pega aquí el token'}
                autoComplete="new-password"
              />
            </Field>
          </div>
        </ActionForm>

        <div className="border-t border-[var(--line-subtle)] pt-5">
          <ActionForm submitVariant="confirm" action={setParkingTestMode} submitLabel="Guardar modo" onSuccessReset={false}>
            <input type="hidden" name="parkingLotId" value={parkingLotId} />
            <Checkbox
              name="testMode"
              defaultChecked={testMode}
              label="Modo de pruebas"
            />
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
              Placa válida: carro por $2.000. Código válido (A7B48): moto por $1.500 o
              bicicleta/patineta por $1.000.
            </p>
          </ActionForm>
        </div>
        </EditableBlock>
      </div>
    </Card>
  );
}

function TestConnection({ parkingLotId }: { parkingLotId: string }) {
  const [state, formAction] = useActionState(testNovaConnection, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="parkingLotId" value={parkingLotId} />
      <TestButton label="Probar conexión" />
      {state ? <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert> : null}
    </form>
  );
}
