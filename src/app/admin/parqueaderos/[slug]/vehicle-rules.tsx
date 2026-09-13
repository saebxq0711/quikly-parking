'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { VehicleIdentifierKind, VehicleType } from '@prisma/client';
import { VehicleIcon } from '@/components/vehicle-icon';
import { Alert, Card, CardHeader, Checkbox, Field, Input, Select } from '@/components/ui';
import { updateVehicleRule } from '../../actions';

export interface RuleView {
  vehicleType: VehicleType;
  label: string;
  identifierKind: VehicleIdentifierKind;
  searchSegment: string;
  searchQuery: string | null;
  inputLabel: string;
  inputPlaceholder: string;
  enabled: boolean;
  overridden: boolean;
}

const KIND_LABEL: Record<VehicleIdentifierKind, string> = {
  PLATE: 'Se busca por placa',
  TICKET_ID: 'Se busca por un identificador numerico',
  CODE: 'Se busca por un codigo alfanumerico',
};

/**
 * Como identifica ESTE parqueadero cada tipo de vehiculo.
 *
 * Solo el CARRO esta definido: se busca por placa. Para moto, bicicleta y
 * patineta el identificador todavia esta por decidir con quien opera el sistema
 * del parqueadero — hoy el codigo impreso del tiquete, pero podria ser otra
 * cosa.
 *
 * Por eso aqui se configura todo: el tipo de dato, la ruta que se consulta y el
 * texto que ve el cliente. Cuando se defina, se escribe y ya: ni un despliegue
 * ni un cambio de codigo.
 */
export function VehicleRules({
  parkingLotId,
  rules,
}: {
  parkingLotId: string;
  rules: RuleView[];
}) {
  const [editing, setEditing] = useState<VehicleType | null>(null);

  return (
    <Card>
      <CardHeader
        title="Identificacion de vehiculos"
        description="Con que dato busca el punto de pago cada tipo de vehiculo en este sitio."
      />

      <ul className="divide-y divide-[var(--line-subtle)]">
        {rules.map((rule) => (
          <li key={rule.vehicleType} className="px-5 py-4">
            <div className="flex items-center gap-4">
              <span
                className={`h-8 w-8 shrink-0 ${
                  rule.enabled ? 'text-brand-300' : 'text-ink-600'
                }`}
              >
                <VehicleIcon type={rule.vehicleType} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm font-medium ${
                      rule.enabled ? 'text-ink-100' : 'text-ink-500'
                    }`}
                  >
                    {rule.label}
                  </p>
                  {!rule.enabled ? (
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-ink-400 ring-1 ring-inset ring-white/15">
                      Oculto en la caja
                    </span>
                  ) : null}
                  {rule.overridden ? (
                    <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-[11px] font-medium text-brand-200 ring-1 ring-inset ring-brand-400/30">
                      Personalizado
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {KIND_LABEL[rule.identifierKind]}
                  {' · '}
                  <span className="font-mono">
                    find-ticket/{rule.searchSegment}/
                    {rule.searchQuery ? `?${rule.searchQuery}` : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  En pantalla pide: <span className="text-ink-300">{rule.inputLabel}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(editing === rule.vehicleType ? null : rule.vehicleType)
                }
                className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100"
              >
                {editing === rule.vehicleType ? 'Cerrar' : 'Cambiar'}
              </button>
            </div>

            {editing === rule.vehicleType ? (
              <RuleForm
                parkingLotId={parkingLotId}
                rule={rule}
                onDone={() => setEditing(null)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RuleForm({
  parkingLotId,
  rule,
  onDone,
}: {
  parkingLotId: string;
  rule: RuleView;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(updateVehicleRule, null);
  const [kind, setKind] = useState<VehicleIdentifierKind>(rule.identifierKind);

  const suggested = rule.searchSegment;

  if (state?.ok) {
    // El servidor ya revalido la pagina: se cierra el formulario y la fila de
    // arriba muestra el valor nuevo.
    setTimeout(onDone, 600);
  }

  return (
    <form action={formAction} className="mt-4 space-y-4 border-t border-[var(--line-subtle)] pt-4">
      <input type="hidden" name="parkingLotId" value={parkingLotId} />
      <input type="hidden" name="vehicleType" value={rule.vehicleType} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Se identifica con"
          hint={
            rule.vehicleType === 'CAR'
              ? undefined
              : 'Para este vehiculo el identificador esta por definir con quien opera el sistema.'
          }
        >
          <Select
            name="identifierKind"
            value={kind}
            onChange={(e) => setKind(e.target.value as VehicleIdentifierKind)}
          >
            <option value="PLATE">Placa</option>
            <option value="TICKET_ID">Identificador numerico</option>
            <option value="CODE">Codigo alfanumerico</option>
          </Select>
        </Field>

        <Field
          label="Ruta de busqueda"
          hint="El segmento que expone el sistema de este sitio."
        >
          <Input
            name="searchSegment"
            key={suggested}
            defaultValue={suggested}
            placeholder="car"
            spellCheck={false}
          />
        </Field>
      </div>

      <Field
        label="Parametros extra de la consulta"
        hint="Sin el signo de interrogacion. Hoy ninguno de los cuatro lo necesita; queda por si otro sitio lo pide."
      >
        <Input
          name="searchQuery"
          defaultValue={rule.searchQuery ?? ''}
          placeholder="by=id"
          spellCheck={false}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Que se le pide en pantalla"
          hint="El nombre con el que el cliente conoce ese dato."
        >
          <Input
            name="inputLabel"
            defaultValue={rule.inputLabel}
            placeholder="Codigo del tiquete"
          />
        </Field>
        <Field label="Ejemplo bajo el campo">
          <Input
            name="inputPlaceholder"
            defaultValue={rule.inputPlaceholder}
            placeholder="A7B48"
          />
        </Field>
      </div>

      <Checkbox
        name="enabled"
        defaultChecked={rule.enabled}
        label="Mostrar este vehiculo en el punto de pago"
      />

      {state ? (
        <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-500 disabled:bg-brand-600/30"
    >
      {pending ? 'Guardando...' : 'Guardar regla'}
    </button>
  );
}
