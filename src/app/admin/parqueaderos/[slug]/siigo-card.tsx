'use client';

import { useActionState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Advanced } from '@/components/advanced';
import { Alert, Card, CardHeader, Checkbox, Field, Input } from '@/components/ui';
import { saveSiigoConfig, testSiigo } from '../../actions';
import { StatusPill, TestButton } from './redeban-card';

/**
 * Facturacion electronica de ESTE parqueadero.
 *
 * Cada parqueadero factura con su propia empresa. A la vista: las credenciales, los
 * cuatro datos de la empresa que la factura necesita y los interruptores. Lo que casi
 * nunca cambia (ambiente, identificador de la aplicacion, cliente por defecto) va
 * plegado.
 */
export function SiigoCard(props: {
  parkingLotId: string;
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

        <ActionForm
          action={saveSiigoConfig}
          submitLabel="Guardar facturacion"
          onSuccessReset={false}
        >
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Comprobante de factura" hint="Id del documento en SIIGO.">
              <Input name="documentId" required inputMode="numeric" defaultValue={props.documentId} />
            </Field>
            <Field label="Vendedor" hint="Id del vendedor en SIIGO.">
              <Input name="sellerId" required inputMode="numeric" defaultValue={props.sellerId} />
            </Field>
            <Field label="Forma de pago con tarjeta" hint="Id en SIIGO.">
              <Input
                name="paymentTypeId"
                required
                inputMode="numeric"
                defaultValue={props.paymentTypeId}
              />
            </Field>
            <Field label="Codigo del servicio" hint="Producto de parqueadero en SIIGO.">
              <Input name="itemCode" required defaultValue={props.itemCode} spellCheck={false} />
            </Field>
          </div>

          <div className="space-y-2.5 rounded-xl bg-white/[0.02] px-4 py-3 ring-1 ring-inset ring-white/8">
            <Checkbox
              name="enabled"
              defaultChecked={props.enabled}
              label="Facturar automaticamente cada pago aprobado"
            />
            <Checkbox
              name="sendStamp"
              defaultChecked={props.sendStamp}
              label="Enviar la factura a la DIAN"
            />
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
                <Input
                  name="baseUrl"
                  required
                  defaultValue={props.baseUrl}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
              <Field label="Identificador de la aplicacion" hint="Letras y numeros.">
                <Input
                  name="partnerId"
                  required
                  defaultValue={props.partnerId}
                  spellCheck={false}
                  autoComplete="off"
                />
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
                <Input
                  name="defaultCustomerIdentification"
                  defaultValue={props.defaultCustomerIdentification}
                />
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
