'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MdArrowBack, MdCheckCircle, MdPrint, MdUsb, MdWarningAmber } from 'react-icons/md';
import {
  emparejarImpresora,
  impresoraEmparejada,
  imprimirPorUsb,
  nombreImpresora,
  usbDisponible,
} from '@/lib/printing/usb-printer';
import { pruebaEscPos } from '@/lib/printing/tickets';

type Estado =
  | { tipo: 'revisando' }
  | { tipo: 'sin-soporte' }
  | { tipo: 'sin-impresora' }
  | { tipo: 'lista'; dispositivo: USBDevice };

/** Traduce los errores de WebUSB a algo que se pueda resolver en el sitio. */
function explicar(error: unknown): string {
  const nombre = error instanceof Error ? error.name : '';
  if (nombre === 'NotFoundError') return 'No se eligio ninguna impresora.';
  if (nombre === 'SecurityError' || nombre === 'NetworkError') {
    return 'El sistema no deja usar la impresora directamente. En un PC con Windows la impresora esta tomada por su controlador de impresion: en el Administrador de dispositivos cambiale el controlador por "WinUsb Device", desconectala, vuelve a conectarla y toca Conectar impresora (ver la guia). En una tablet Android, desconecta y vuelve a conectar el cable.';
  }
  return error instanceof Error ? error.message : 'No fue posible usar la impresora.';
}

export function PrinterSetup({
  parkingLotName,
  backHref,
}: {
  parkingLotName: string;
  backHref: string;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'revisando' });
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!usbDisponible()) {
      setEstado({ tipo: 'sin-soporte' });
      return;
    }
    impresoraEmparejada()
      .then((dispositivo) =>
        setEstado(dispositivo ? { tipo: 'lista', dispositivo } : { tipo: 'sin-impresora' }),
      )
      .catch(() => setEstado({ tipo: 'sin-impresora' }));
  }, []);

  async function conectar() {
    setOcupado(true);
    setMensaje(null);
    try {
      const dispositivo = await emparejarImpresora();
      setEstado({ tipo: 'lista', dispositivo });
      setMensaje({ ok: true, texto: 'Impresora conectada. Imprime una prueba para confirmar.' });
    } catch (error) {
      setMensaje({ ok: false, texto: explicar(error) });
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    if (estado.tipo !== 'lista') return;
    setOcupado(true);
    setMensaje(null);
    try {
      await imprimirPorUsb(
        estado.dispositivo,
        pruebaEscPos(parkingLotName, nombreImpresora(estado.dispositivo)),
      );
      setMensaje({ ok: true, texto: 'Prueba enviada. Si salio el papel con el QR, el kiosco ya imprime solo.' });
    } catch (error) {
      setMensaje({ ok: false, texto: explicar(error) });
    } finally {
      setOcupado(false);
    }
  }

  const boton =
    'inline-flex min-h-15 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-semibold transition-colors duration-150 disabled:opacity-50';

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-ink-100"
        >
          <MdArrowBack className="h-4 w-4" aria-hidden focusable="false" />
          Volver al punto de pago
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Impresora del kiosco</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Conecta la impresora de recibos por USB y autorizala una sola vez. Despues el
          kiosco imprime las facturas solo, sin controladores ni ventanas de impresion.
        </p>

        <div className="mt-6 rounded-2xl bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)]">
          {estado.tipo === 'revisando' ? (
            <p className="text-[var(--text-secondary)]">Buscando impresora...</p>
          ) : estado.tipo === 'sin-soporte' ? (
            <div className="flex gap-3">
              <MdWarningAmber className="mt-0.5 h-6 w-6 shrink-0 text-warn-400" aria-hidden focusable="false" />
              <div className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
                <p className="font-medium text-ink-100">Este navegador no conecta impresoras USB directamente.</p>
                <p className="mt-1">
                  Abre el kiosco en <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong>,
                  en la tablet Android o en el PC con Windows.
                </p>
              </div>
            </div>
          ) : estado.tipo === 'sin-impresora' ? (
            <div className="flex gap-3">
              <MdUsb className="mt-0.5 h-6 w-6 shrink-0 text-[var(--text-muted)]" aria-hidden focusable="false" />
              <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
                Todavia no hay una impresora autorizada. Conectala, enciendela y toca{' '}
                <strong>Conectar impresora</strong>.
              </p>
            </div>
          ) : (
            <div className="flex gap-3">
              <MdCheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-ok-400" aria-hidden focusable="false" />
              <div>
                <p className="font-medium text-ink-100">{nombreImpresora(estado.dispositivo)}</p>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                  Conectada. El kiosco la usara para imprimir.
                </p>
              </div>
            </div>
          )}
        </div>

        {mensaje ? (
          <p
            role="status"
            className={`mt-4 rounded-xl px-4 py-3 text-[15px] leading-relaxed ring-1 ${
              mensaje.ok
                ? 'bg-ok-500/10 text-ok-300 ring-ok-400/25'
                : 'bg-bad-500/10 text-bad-300 ring-bad-400/25'
            }`}
          >
            {mensaje.texto}
          </p>
        ) : null}

        {estado.tipo !== 'sin-soporte' && estado.tipo !== 'revisando' ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={conectar}
              disabled={ocupado}
              className={`${boton} bg-white/[0.05] text-ink-100 ring-1 ring-inset ring-white/12 hover:bg-white/[0.1]`}
            >
              <MdUsb className="h-5 w-5" aria-hidden focusable="false" />
              {estado.tipo === 'lista' ? 'Cambiar impresora' : 'Conectar impresora'}
            </button>
            <button
              type="button"
              onClick={probar}
              disabled={ocupado || estado.tipo !== 'lista'}
              className={`${boton} bg-brand-600 text-white hover:bg-brand-500`}
            >
              <MdPrint className="h-5 w-5" aria-hidden focusable="false" />
              {ocupado ? 'Imprimiendo...' : 'Imprimir prueba'}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
