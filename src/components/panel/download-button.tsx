'use client';

import { useState } from 'react';
import { MdDownload } from 'react-icons/md';

/**
 * Descarga de datos en CSV, armado en el navegador.
 *
 * El archivo se genera aqui y no en el servidor del parqueadero a proposito: sus
 * endpoints devuelven JSON y no queremos pedirle que construya descargas
 * (REQUERIMIENTOS_PANEL_ADMIN.md seccion 3.2). Los datos ya viajaron para
 * pintarse en pantalla, asi que el archivo no cuesta una consulta mas.
 */

export interface Column {
  key: string;
  label: string;
}

/**
 * Neutraliza las formulas de hoja de calculo.
 *
 * Excel y Sheets ejecutan cualquier celda que empiece por `=`, `+`, `-` o `@`.
 * Como parte de estos datos son texto libre que entra por el sistema del
 * parqueadero (comentarios de caja, nombres, placas), una celda podria llegar
 * con `=HYPERLINK(...)` y ejecutarse al abrir el archivo en la maquina del
 * administrador. Un apostrofe delante la vuelve texto sin cambiar lo que se lee.
 */
function neutralizarFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

function celda(value: unknown): string {
  if (value === null || value === undefined) return '';
  const texto = neutralizarFormula(String(value));
  // Las comillas se duplican y el campo se entrecomilla: es lo que pide el CSV
  // cuando el contenido trae comas, saltos de linea o comillas.
  return `"${texto.replace(/"/g, '""')}"`;
}

export function DownloadButton({
  filename,
  columns,
  rows,
  label = 'Descargar CSV',
}: {
  filename: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const descargar = () => {
    setBusy(true);
    try {
      const lineas = [
        columns.map((c) => celda(c.label)).join(','),
        ...rows.map((row) => columns.map((c) => celda(row[c.key])).join(',')),
      ];

      // El BOM es lo que hace que Excel en Windows lea el archivo como UTF-8;
      // sin el, las tildes y las enes salen rotas.
      const blob = new Blob(['﻿' + lineas.join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });

      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
      enlace.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={busy || rows.length === 0}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[13px] font-medium text-ink-100 ring-1 ring-[var(--line-subtle)] transition-colors duration-150 hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <MdDownload className="h-4 w-4" aria-hidden focusable="false" />
      {label}
    </button>
  );
}
