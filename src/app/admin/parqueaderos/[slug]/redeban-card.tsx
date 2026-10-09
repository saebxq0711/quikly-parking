'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionForm } from '@/components/action-form';
import { Advanced } from '@/components/advanced';
import { Alert, Field, Input, Select, buttonClassName } from '@/components/ui';
import { SIP_NETWORKS } from '@/integrations/sipconnector/codes';
import { saveRedebanConfig, testRedeban } from '../../actions';

/**
 * Credenciales del datafono de UN kiosco.
 *
 * Cada kiosco cobra con su propio datafono: su codigo unico, usuario, clave y codigo de
 * terminal. A la vista las cuatro que entrega Redeban; el ambiente y la red, que casi
 * nunca cambian, van plegados.
 */
export function RedebanForm({
  parkingLotId,
  paymentPointId,
  baseUrl,
  codigoUnico,
  codigoTerminal,
  usuario,
  red,
  hasPassword,
  missing,
}: {
  parkingLotId: string;
  paymentPointId: string;
  baseUrl: string | null;
  codigoUnico: string | null;
  codigoTerminal: string | null;
  usuario: string | null;
  red: string;
  hasPassword: boolean;
  missing: string[];
}) {
  return (
    <div className="space-y-4">
      {missing.length > 0 ? (
        <Alert tone="warning" title="Falta configurar">
          {missing.join(', ')}.
        </Alert>
      ) : (
        <TestConnection parkingLotId={parkingLotId} paymentPointId={paymentPointId} />
      )}

      <ActionForm submitVariant="confirm" action={saveRedebanConfig} submitLabel="Guardar datáfono" onSuccessReset={false}>
        <input type="hidden" name="parkingLotId" value={parkingLotId} />
        <input type="hidden" name="paymentPointId" value={paymentPointId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Código único" hint="Con sus ceros a la izquierda.">
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
          <Field label="Código del datáfono">
            <Input
              name="codigoTerminal"
              required
              defaultValue={codigoTerminal ?? ''}
              placeholder="TERM0001"
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Usuario">
            <Input
              name="usuario"
              required
              defaultValue={usuario ?? ''}
              placeholder="usuario@comercio.com"
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Clave" hint={hasPassword ? 'Guardada. Déjala vacía para conservarla.' : undefined}>
            <Input
              name="clave"
              type="password"
              placeholder={hasPassword ? '••••••••' : ''}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <Advanced>
          <Field label="Ambiente del servicio" hint="Pruebas y producción tienen direcciones distintas.">
            <Input
              name="baseUrl"
              required
              defaultValue={baseUrl ?? 'https://sipconnectortest.azurewebsites.net'}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Red que procesa el pago">
            <Select name="red" defaultValue={red}>
              {SIP_NETWORKS.map((network) => (
                <option key={network.value} value={network.value}>
                  {network.label}
                </option>
              ))}
            </Select>
          </Field>
        </Advanced>
      </ActionForm>
    </div>
  );
}

export function StatusPill({
  ok,
  okLabel = 'Listo',
  pendingLabel = 'Pendiente',
}: {
  ok: boolean;
  okLabel?: string;
  pendingLabel?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        ok ? 'bg-ok-50 text-ok-700 ring-ok-400/30' : 'bg-warn-100/60 text-warn-700 ring-warn-400/30'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-ok-400' : 'bg-warn-400'}`} />
      {ok ? okLabel : pendingLabel}
    </span>
  );
}

/** Pide la version y un token al servicio: comprueba credenciales sin mover dinero. */
function TestConnection({ parkingLotId, paymentPointId }: { parkingLotId: string; paymentPointId: string }) {
  const [state, formAction] = useActionState(testRedeban, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="parkingLotId" value={parkingLotId} />
      <input type="hidden" name="paymentPointId" value={paymentPointId} />
      <TestButton label="Probar datáfono" />
      {state ? <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert> : null}
    </form>
  );
}

export function TestButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // El mismo boton secundario pequeno que "Editar": van uno al lado del otro.
      className={buttonClassName('secondary', 'sm', 'px-4')}
    >
      {pending ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {pending ? 'Probando…' : label}
    </button>
  );
}
