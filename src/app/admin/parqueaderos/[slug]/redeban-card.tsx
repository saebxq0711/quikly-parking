'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionForm } from '@/components/action-form';
import { Alert, Card, CardHeader, Field, Input, Select } from '@/components/ui';
import { SIP_NETWORKS } from '@/integrations/sipconnector/codes';
import { saveRedebanConfig, testRedeban } from '../../actions';

/**
 * Credenciales del datafono de ESTE parqueadero.
 *
 * Cada parqueadero es un comercio distinto ante la red: su propio codigo unico,
 * su propio usuario y su propio datafono. Por eso se configura por sitio y no
 * en una variable global.
 *
 * Los campos van con su nombre real del manual entre parentesis. No es adorno:
 * quien recibe las credenciales del integrador las recibe con esos nombres, y
 * tener que adivinar cual va donde es como se configura mal un cobro.
 */
export function RedebanCard({
  parkingLotId,
  baseUrl,
  codigoUnico,
  codigoTerminal,
  red,
  hasPassword,
  missing,
}: {
  parkingLotId: string;
  baseUrl: string | null;
  codigoUnico: string | null;
  codigoTerminal: string | null;
  red: string;
  hasPassword: boolean;
  missing: string[];
}) {
  return (
    <Card>
      <CardHeader
        title="Datafono (Redeban / SIPConnector)"
        description="Con estas credenciales la plataforma envia el cobro al datafono de este parqueadero."
      />

      <div className="space-y-5 p-5">
        {missing.length > 0 ? (
          <Alert tone="warning" title="Configuracion incompleta">
            <p>Sin estos datos no se puede cobrar con tarjeta:</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <TestConnection parkingLotId={parkingLotId} />
        )}

        <ActionForm
          action={saveRedebanConfig}
          submitLabel="Guardar credenciales"
          onSuccessReset={false}
        >
          <input type="hidden" name="parkingLotId" value={parkingLotId} />

          <Field
            label="URL del servicio (ambiente)"
            hint="Pruebas y produccion tienen dominios distintos."
          >
            <Input
              name="baseUrl"
              required
              defaultValue={baseUrl ?? 'https://sipconnectortest.azurewebsites.net'}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Codigo unico (CodigoUnico)"
              hint="Con todos sus ceros a la izquierda: quitarlos lo invalida."
            >
              <Input
                name="codigoUnico"
                required
                inputMode="numeric"
                defaultValue={codigoUnico ?? ''}
                placeholder="0000000000"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>

            <Field
              label="Codigo del datafono (CodigoTerminal)"
              hint="Identifica el aparato que recibe la operacion."
            >
              <Input
                name="codigoTerminal"
                required
                defaultValue={codigoTerminal ?? ''}
                placeholder="TERM0001"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>

            <Field label="Usuario (Usuario)">
              <Input
                name="usuario"
                required
                placeholder="usuario@comercio.com"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>

            <Field
              label="Clave (Clave)"
              hint={
                hasPassword
                  ? 'Ya hay una guardada. Dejala vacia para conservarla.'
                  : 'Se guarda cifrada y no vuelve a mostrarse.'
              }
            >
              <Input
                name="clave"
                type="password"
                placeholder={hasPassword ? 'Sin cambios' : ''}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <Field
            label="Red que procesa el pago (Red)"
            hint="Segun el Anexo 5 del manual del servicio."
          >
            <Select name="red" defaultValue={red}>
              {SIP_NETWORKS.map((network) => (
                <option key={network.value} value={network.value}>
                  {network.value} · {network.label}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </div>
    </Card>
  );
}

/**
 * Prueba real contra el servicio: pide la version y luego un token, con lo que
 * queda comprobado el ambiente, el codigo unico, el usuario y la clave. No
 * mueve dinero ni ocupa el datafono.
 */
function TestConnection({ parkingLotId }: { parkingLotId: string }) {
  const [state, formAction] = useActionState(testRedeban, null);

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
      {pending ? 'Probando...' : 'Probar credenciales'}
    </button>
  );
}
