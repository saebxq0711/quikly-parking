import type { ParkingLot } from '@prisma/client';
import { Field, Input, Select, cn } from '@/components/ui';

/**
 * Datos de un parqueadero, por grupos: los mismos al crear y al editar.
 *
 * Encabezan el comprobante y la factura que imprime su kiosco, y todos son
 * obligatorios salvo el correo y el horario (`parkingLotSchema` en `actions.ts`).
 * Van en secciones con su titulo y su para que al lado: trece campos seguidos en
 * una columna era lo que hacia ilegible el formulario anterior.
 */

type LotData = Pick<
  ParkingLot,
  | 'legalName'
  | 'nit'
  | 'taxRegime'
  | 'address'
  | 'city'
  | 'department'
  | 'phone'
  | 'email'
  | 'insurer'
  | 'insurancePolicy'
  | 'businessHours'
>;

/**
 * Un campo obligatorio vacio de un sitio que ya existe se marca en naranja
 * advertencia: es lo que la ficha dice que falta, y tiene que verse donde se arregla.
 */
const FALTA_CLASE = 'ring-2 ring-warn-400 hover:ring-warn-500';
function faltaHint(texto?: string) {
  return (
    <span className="font-medium text-warn-700">
      Falta{texto ? `. ${texto}` : ': va impreso en el comprobante.'}
    </span>
  );
}
function falta(mark: boolean | undefined, valor: string | null | undefined): boolean {
  return Boolean(mark) && !valor;
}

/** Una seccion de formulario: titulo y explicacion a la izquierda, campos a la derecha. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-[var(--line-subtle)] py-7 first-of-type:border-t-0 first-of-type:pt-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function CompanyFields({ lot, markMissing }: { lot?: LotData; markMissing?: boolean }) {
  return (
    <FormSection
      title="Empresa"
      description="Sale en el comprobante y en la factura. Escríbela tal como aparece en el RUT."
    >
      <Field label="Razón social" hint={falta(markMissing, lot?.legalName) ? faltaHint() : undefined}>
        <Input
          name="legalName"
          required
          defaultValue={lot?.legalName ?? ''}
          placeholder="Como aparece en el RUT"
          className={falta(markMissing, lot?.legalName) ? FALTA_CLASE : undefined}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="NIT" hint={falta(markMissing, lot?.nit) ? faltaHint('Con dígito de verificación.') : 'Con dígito de verificación.'}>
          <Input
            name="nit"
            required
            defaultValue={lot?.nit ?? ''}
            placeholder="Ej.: 900123456-7"
            spellCheck={false}
            className={cn('tnum', falta(markMissing, lot?.nit) && FALTA_CLASE)}
          />
        </Field>
        <Field label="Régimen de IVA">
          <Select name="taxRegime" required defaultValue={lot?.taxRegime ?? ''}>
            <option value="" disabled>
              Elegir
            </option>
            <option value="Responsable de IVA">Responsable de IVA</option>
            <option value="No responsable de IVA">No responsable de IVA</option>
          </Select>
        </Field>
      </div>
    </FormSection>
  );
}

export function LocationFields({ lot, markMissing }: { lot?: LotData; markMissing?: boolean }) {
  return (
    <FormSection
      title="Ubicación y contacto"
      description="Dónde está el parqueadero y cómo lo contacta el cliente."
    >
      <Field label="Dirección" hint={falta(markMissing, lot?.address) ? faltaHint() : undefined}>
        <Input
          name="address"
          required
          defaultValue={lot?.address ?? ''}
          placeholder="Ej.: Calle 15 # 10-20"
          className={falta(markMissing, lot?.address) ? FALTA_CLASE : undefined}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ciudad">
          <Input name="city" required defaultValue={lot?.city ?? ''} placeholder="Ej.: Ibagué" />
        </Field>
        <Field label="Departamento">
          <Input name="department" required defaultValue={lot?.department ?? ''} placeholder="Ej.: Tolima" />
        </Field>
        <Field label="Teléfono">
          <Input name="phone" type="tel" required defaultValue={lot?.phone ?? ''} placeholder="Ej.: 601 234 5678" />
        </Field>
        <Field label="Correo" hint="Opcional.">
          <Input name="email" type="email" defaultValue={lot?.email ?? ''} placeholder="Ej.: contacto@parqueadero.co" />
        </Field>
      </div>
      <Field label="Horario de atención" hint="Opcional. Como se informa al público.">
        <Input
          name="businessHours"
          defaultValue={lot?.businessHours ?? ''}
          placeholder="Ej.: lunes a sábado, 6:00 a. m. a 10:00 p. m."
        />
      </Field>
    </FormSection>
  );
}

export function PolicyFields({ lot, markMissing }: { lot?: LotData; markMissing?: boolean }) {
  return (
    <FormSection
      title="Póliza"
      description="La póliza de responsabilidad civil que cubre los vehículos. Va impresa en el comprobante."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aseguradora" hint={falta(markMissing, lot?.insurer) ? faltaHint() : undefined}>
          <Input
            name="insurer"
            required
            defaultValue={lot?.insurer ?? ''}
            placeholder="Nombre de la aseguradora"
            className={falta(markMissing, lot?.insurer) ? FALTA_CLASE : undefined}
          />
        </Field>
        <Field label="Número de póliza" hint={falta(markMissing, lot?.insurancePolicy) ? faltaHint() : undefined}>
          <Input
            name="insurancePolicy"
            required
            defaultValue={lot?.insurancePolicy ?? ''}
            placeholder="Como aparece en la póliza"
            spellCheck={false}
            className={cn('tnum', falta(markMissing, lot?.insurancePolicy) && FALTA_CLASE)}
          />
        </Field>
      </div>
    </FormSection>
  );
}
