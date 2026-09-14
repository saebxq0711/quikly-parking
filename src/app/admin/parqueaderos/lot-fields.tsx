import type { ParkingLot } from '@prisma/client';
import { Field, Input, Select } from '@/components/ui';
import { cn } from '@/components/ui';

/**
 * Datos del emisor de un parqueadero: encabezan el comprobante y la factura que imprime
 * su kiosco. Son los mismos al crear y al editar, y todos obligatorios salvo el correo
 * (`parkingLotSchema` en `actions.ts`).
 */
export function ParkingLotDataFields({
  lot,
  compacto = false,
}: {
  lot?: Pick<
    ParkingLot,
    'legalName' | 'nit' | 'taxRegime' | 'address' | 'city' | 'department' | 'phone' | 'email'
  >;
  /** Una sola columna, para la tarjeta angosta de "Nuevo parqueadero". */
  compacto?: boolean;
}) {
  const pares = cn('grid gap-4', !compacto && 'sm:grid-cols-2');

  return (
    <div className="space-y-4 border-t border-[var(--line-subtle)] pt-4">
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
        Salen en el comprobante y en la factura que imprime el kiosco. Escribelos tal como
        aparecen en el RUT.
      </p>

      <Field label="Razon social">
        <Input
          name="legalName"
          required
          defaultValue={lot?.legalName ?? ''}
          placeholder="Parqueaderos del Centro S.A.S."
        />
      </Field>

      <div className={pares}>
        <Field label="NIT" hint="Con digito de verificacion.">
          <Input
            name="nit"
            required
            defaultValue={lot?.nit ?? ''}
            placeholder="900123456-7"
            spellCheck={false}
          />
        </Field>
        <Field label="Regimen de IVA">
          <Select name="taxRegime" required defaultValue={lot?.taxRegime ?? ''}>
            <option value="" disabled>
              Elegir
            </option>
            <option value="Responsable de IVA">Responsable de IVA</option>
            <option value="No responsable de IVA">No responsable de IVA</option>
          </Select>
        </Field>
      </div>

      <Field label="Direccion">
        <Input
          name="address"
          required
          defaultValue={lot?.address ?? ''}
          placeholder="Calle 15 # 10-20"
        />
      </Field>

      <div className={pares}>
        <Field label="Ciudad">
          <Input name="city" required defaultValue={lot?.city ?? ''} />
        </Field>
        <Field label="Departamento">
          <Input name="department" required defaultValue={lot?.department ?? ''} />
        </Field>
        <Field label="Telefono">
          <Input name="phone" type="tel" required defaultValue={lot?.phone ?? ''} />
        </Field>
        <Field label="Correo" hint="Opcional.">
          <Input name="email" type="email" defaultValue={lot?.email ?? ''} />
        </Field>
      </div>
    </div>
  );
}
