'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { MdCheck, MdDownload } from 'react-icons/md';

/**
 * "Guardar en el celular": convierte el tiquete en una imagen.
 *
 * Una pagina guardada se puede perder (se cierra la pestaña, se borra el
 * historial); una imagen en la galeria no. En celulares que lo permiten se abre el
 * menu de compartir, desde donde se guarda en fotos o se envia por WhatsApp; en los
 * demas se descarga el archivo.
 *
 * La imagen lleva el QR con el CODIGO solo, igual que el tiquete impreso: es lo que
 * leen los escaneres del punto de pago y de la salida.
 */
export function SaveTicket({ code }: { code: string }) {
  const [estado, setEstado] = useState<'listo' | 'generando' | 'guardado' | 'error'>('listo');

  async function crearImagen(): Promise<Blob> {
    const ancho = 720;
    const alto = 980;
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Sin lienzo');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.textAlign = 'center';

    ctx.fillStyle = '#111111';
    ctx.font = '600 40px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Tiquete de parqueadero', ancho / 2, 90);

    const qr = await QRCode.toDataURL(code, { margin: 1, width: 500, errorCorrectionLevel: 'M' });
    const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = qr;
    });
    ctx.drawImage(imagen, (ancho - 500) / 2, 140, 500, 500);

    ctx.fillStyle = '#666666';
    ctx.font = '600 26px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('CODIGO', ancho / 2, 720);

    ctx.fillStyle = '#111111';
    ctx.font = '700 104px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText(code.split('').join(' '), ancho / 2, 830);

    ctx.fillStyle = '#666666';
    ctx.font = '400 26px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Muestralo al pagar o escribe el codigo en la pantalla.', ancho / 2, 910);

    return new Promise((resolve, reject) =>
      lienzo.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Sin imagen'))), 'image/png'),
    );
  }

  async function guardar() {
    setEstado('generando');
    try {
      const blob = await crearImagen();
      const archivo = new File([blob], `tiquete-${code}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: `Tiquete ${code}` });
      } else {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = archivo.name;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      setEstado('guardado');
    } catch (error) {
      // Cerrar el menu de compartir no es un error.
      setEstado(error instanceof Error && error.name === 'AbortError' ? 'listo' : 'error');
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={guardar}
        disabled={estado === 'generando'}
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-base font-semibold text-white transition-colors duration-150 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-60"
      >
        {estado === 'guardado' ? (
          <MdCheck className="h-5 w-5" aria-hidden focusable="false" />
        ) : (
          <MdDownload className="h-5 w-5" aria-hidden focusable="false" />
        )}
        {estado === 'generando'
          ? 'Preparando imagen...'
          : estado === 'guardado'
            ? 'Tiquete guardado'
            : 'Guardar en el celular'}
      </button>
      {estado === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-bad-400">
          No se pudo guardar. Tomale una captura a esta pantalla.
        </p>
      ) : null}
    </div>
  );
}
