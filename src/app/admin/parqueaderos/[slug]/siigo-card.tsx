'use client';

import { ActionForm } from '@/components/action-form';
import { Checkbox, Field, Input } from '@/components/ui';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Card, CardHeader } from '@/components/ui';
import { saveSiigoConfig, testSiigo } from '../../actions';

/**
 * Configuracion de facturacion.
 *
 * Cada parqueadero factura con su propia empresa: sus credenciales, su
 * numeracion y su base de clientes. Dos sitios no pueden emitir bajo el mismo
 * NIT, asi que esto vive en la ficha del sitio y no en una configuracion comun.
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
        title="Facturacion electronica (SIIGO)"
        description="Se emite sola cuando un pago queda aprobado, por el valor exacto que se cobro."
      />

      <div className="space-y-5 p-5">
        {props.missing.length > 0 ? (
          <Alert tone="warning" title="Configuracion incompleta">
            <p>Sin estos datos no se emite ninguna factura:</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {props.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2">
              Los encuentra el contador de la empresa en SIIGO, en la configuracion de
              documentos, vendedores, formas de pago y productos.
            </p>
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
        <Field label="URL del servicio">
          <Input
            name="baseUrl"
            required
            defaultValue={props.baseUrl}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
        <Field
          label="Identificador de la aplicacion"
          hint="Solo letras y numeros, sin guiones ni puntos."
        >
          <Input
            name="partnerId"
            required
            defaultValue={props.partnerId}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      </div>
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
          label="Clave de acceso"
          hint={
            props.hasAccessKey
              ? 'Ya hay una guardada. Dejala vacia para conservarla.'
              : 'Se guarda cifrada y no vuelve a mostrarse.'
          }
        >
          <Input
            name="accessKey"
            type="password"
            placeholder={props.hasAccessKey ? 'Sin cambios' : ''}
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="border-t border-[var(--line-subtle)] pt-4">
        <p className="mb-3 text-[13px] font-medium text-ink-200">
          Datos de la empresa en SIIGO
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo de comprobante" hint="Numero del documento de factura de venta.">
            <Input
              name="documentId"
              required
              inputMode="numeric"
              defaultValue={props.documentId}
            />
          </Field>
          <Field label="Vendedor" hint="Numero del vendedor asignado.">
            <Input
              name="sellerId"
              required
              inputMode="numeric"
              defaultValue={props.sellerId}
            />
          </Field>
          <Field label="Forma de pago" hint="Numero de la forma de pago con tarjeta.">
            <Input
              name="paymentTypeId"
              required
              inputMode="numeric"
              defaultValue={props.paymentTypeId}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Codigo del servicio" hint="Producto o servicio de parqueadero.">
            <Input
              name="itemCode"
              required
              defaultValue={props.itemCode}
              spellCheck={false}
            />
          </Field>
          <Field label="Descripcion en la factura">
            <Input name="itemDescription" defaultValue={props.itemDescription} />
          </Field>
        </div>
      </div>

      <div className="border-t border-[var(--line-subtle)] pt-4">
        <p className="mb-1 text-[13px] font-medium text-ink-200">
          Cliente por defecto
        </p>
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Solo se usa si una factura se emite sin datos del cliente. En el kiosco cada
          cliente registra su documento y su correo.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo de documento">
            <Input
              name="defaultCustomerIdType"
              defaultValue={props.defaultCustomerIdType}
            />
          </Field>
          <Field label="Identificacion">
            <Input
              name="defaultCustomerIdentification"
              defaultValue={props.defaultCustomerIdentification}
            />
          </Field>
          <Field label="Nombre">
            <Input
              name="defaultCustomerName"
              defaultValue={props.defaultCustomerName}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-[var(--line-subtle)] pt-4">
        <Checkbox
          name="enabled"
          defaultChecked={props.enabled}
          label="Facturar automaticamente cada pago aprobado"
        />
        <Checkbox
          name="sendStamp"
          defaultChecked={props.sendStamp}
          label="Enviar la factura a la DIAN (comprobante electronico)"
        />
        <Checkbox
          name="sendMail"
          defaultChecked={props.sendMail}
          label="Enviar la factura electronica al correo del cliente"
        />
      </div>
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
      {pending ? 'Probando...' : 'Probar facturacion'}
    </button>
  );
}
