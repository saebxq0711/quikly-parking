'use client';

import { useState } from 'react';
import { MdDownload } from 'react-icons/md';

/**
 * Descarga del reporte en Excel.
 *
 * Se pide con fetch y no con un enlace directo: el archivo tarda unos segundos (el
 * sistema del parqueadero arma el volcado por el tunel), y con un enlace el boton no
 * mostraba nada mientras tanto. Si el servidor rechaza el periodo, se dice aqui en vez
 * de descargar un archivo de error.
 */
export function ExcelButton({ href, filename }: { href: string; filename: string }) {
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function descargar() {
    setGenerando(true);
    setMensaje(null);
    try {
      const response = await fetch(href);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMensaje(data?.error?.message ?? 'No fue posible generar el reporte.');
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = filename;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setMensaje('No fue posible generar el reporte. Intenta de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={descargar}
        disabled={generando}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-ok-600 px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgb(16_185_129/0.7)] transition-colors duration-150 hover:bg-ok-500 disabled:opacity-70"
      >
        {generando ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          <MdDownload className="h-4.5 w-4.5" aria-hidden focusable="false" />
        )}
        {generando ? 'Generando Excel...' : 'Descargar Excel'}
      </button>
      {mensaje ? <p className="text-xs text-bad-300">{mensaje}</p> : null}
    </div>
  );
}
