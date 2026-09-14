'use client';

import { useActionState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Advanced } from '@/components/advanced';
import { Alert, Card, CardHeader, Checkbox, Field, Input, Select } from '@/components/ui';
import type { SiigoCatalogs, SiigoOption } from '@/lib/parking/siigo';
import { saveSiigoConfig, testSiigo } from '../../actions';
import { StatusPill, TestButton } from './redeban-card';

/**
 * Facturacion electronica de ESTE parqueadero.
 *
 * Cada parqueadero factura con su propia empresa. Con las credenciales guardadas, el
 * comprobante, el vendedor, la forma de pago y el producto se eligen de las listas que
 * devuelve SIIGO; si SIIGO no responde, quedan como campos de texto para escribir el id.
 */
export function SiigoCard(props: {
  parkingLotId: string;
  catalogs: SiigoCatalogs;
  baseUrl: string;
  partnerId: string;
  enabled: boolean;
  missing: string[];
  username: string;
  hasAccessKey: boolean;
  documentId: string;
  sellerId: string;
  paymentTypeId: string;
  itemCode: string;
  itemDescription: string;
  defaultCustomerIdType: string;
  defaultCustomerIdentification: string;
  defaultCustomerName: string;
  sendStamp: boolean;
  sendMail: boolean;
}) {
  const { catalogs } = props;

  return (
    <Card>
      <CardHeader
        title="Facturacion SIIGO"
        description="Cada pago aprobado se factura solo, por el valor cobrado."
        action={<StatusPill ok={props.missing.length === 0} />}
      />

      <div className="space-y-5 p-5">
        {props.missing.length > 0 ? (
          <Alert tone="warning" title="Falta configurar">
            {props.missing.join(', ')}.
          </Alert>
        ) : (
          <TestSiigo parkingLotId={props.parkingLotId} />
        )}

        <ActionForm action={saveSiigoConfig} submitLabel="Guardar facturacion" onSuccessReset={false}>
          <input type="hidden" name="parkingLotId" value={props.parkingLotId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usuario de SIIGO">
              <Input
                name="username"
                type="email"
                required
                defaultValue={props.username}
                placeholder="usuario@empresa.com"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Clave de acceso (access key)"
              hint={props.hasAccessKey ? 'Guardada. Dejala vacia para conservarla.' : undefined}
            >
              <Input
                name="accessKey"
                type="password"
                placeholder={props.hasAccessKey ? '••••••••' : ''}
                autoComplete="new-password"
              />
            </Field>
          </div>

          {!catalogs.ok ? (
            <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-muted)] ring-1 ring-inset ring-white/8">
              No pudimos traer las listas de SIIGO ({catalogs.message}). Revisa el usuario y la
              clave, o escribe los ids a mano.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <CatalogField
              label="Comprobante de factura"
              name="documentId"
              value={props.documentId}
              options={catalogs.ok ? catalogs.documents : null}
              placeholder="Elige el comprobante"
              numeric
            />
            <CatalogField
              label="Vendedor"
              name="sellerId"
              value={props.sellerId}
              options={catalogs.ok ? catalogs.sellers : null}
              placeholder="Elige el vendedor"
              numeric
            />
            <CatalogField
              label="Forma de pago con tarjeta"
              name="paymentTypeId"
              value={props.paymentTypeId}
              options={catalogs.ok ? catalogs.paymentTypes : null}
              placeholder="Elige la forma de pago"
              numeric
            />
            <CatalogField
              label="Servicio de parqueadero"
              name="itemCode"
              value={props.itemCode}
              options={catalogs.ok ? catalogs.products : null}
              placeholder="Elige el producto"
            />
          </div>

          <div className="space-y-2.5 rounded-xl bg-white/[0.02] px-4 py-3 ring-1 ring-inset ring-white/8">
            <Checkbox
              name="enabled"
              defaultChecked={props.enabled}
              label="Facturar automaticamente cada pago aprobado"
            />
            <Checkbox name="sendStamp" defaultChecked={props.sendStamp} label="Enviar la factura a la DIAN" />
            <Checkbox
              name="sendMail"
              defaultChecked={props.sendMail}
              label="Enviar la factura al correo del cliente"
            />
          </div>

          <Advanced>
            <Field label="Descripcion en la factura">
              <Input name="itemDescription" defaultValue={props.itemDescription} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Direccion del servicio">
                <Input name="baseUrl" required defaultValue={props.baseUrl} spellCheck={false} autoComplete="off" />
              </Field>
              <Field label="Identificador de la aplicacion" hint="Letras y numeros.">
                <Input name="partnerId" required defaultValue={props.partnerId} spellCheck={false} autoComplete="off" />
              </Field>
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
              Cliente por defecto: solo se usa si una factura sale sin datos del cliente.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tipo de documento">
                <Input name="defaultCustomerIdType" defaultValue={props.defaultCustomerIdType} />
              </Field>
              <Field label="Identificacion">
                <Input name="defaultCustomerIdentification" defaultValue={props.defaultCustomerIdentification} />
              </Field>
              <Field label="Nombre">
                <Input name="defaultCustomerName" defaultValue={props.defaultCustomerName} />
              </Field>
            </div>
          </Advanced>
        </ActionForm>
      </div>
    </Card>
  );
}

/**
 * Lista de SIIGO si se pudo traer; campo de texto si no. Un valor ya guardado que no
 * aparece en la lista (desactivado en SIIGO, por ejemplo) se conserva como opcion.
 */
function CatalogField({
  label,
  name,
  value,
  options,
  placeholder,
  numeric = false,
}: {
  label: string;
  name: string;
  value: string;
  options: SiigoOption[] | null;
  placeholder: string;
  numeric?: boolean;
}) {
  if (!options) {
    return (
      <Field label={label} hint="Id en SIIGO.">
        <Input name={name} required inputMode={numeric ? 'numeric' : undefined} defaultValue={value} />
      </Field>
    );
  }

  const conocido = value === '' || options.some((opcion) => opcion.value === value);
  return (
    <Field label={label}>
      <Select name={name} required defaultValue={value}>
        <option value="" disabled>
          {placeholder}
        </option>
        {!conocido ? <option value={value}>Actual: {value}</option> : null}
        {options.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Prueba las credenciales pidiendo un catalogo, sin emitir ningun documento. */
function TestSiigo({ parkingLotId }: { parkingLotId: string }) {
  const [state, formAction] = useActionState(testSiigo, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="parkingLotId" value={parkingLotId} />
      <TestButton label="Probar facturacion" />
      {state ? <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert> : null}
    </form>
  );
}
