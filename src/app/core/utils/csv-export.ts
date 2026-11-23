/**
 * CSV seguro (23/11/2026): UTF-8 con BOM y punto y coma (Excel en español lo abre en columnas). Un valor que una hoja de
 * cálculo interpretaría como fórmula (=, +, -, @, tabulador o retorno) se antepone con un apóstrofo.
 */
export const CSV_MIME = 'text/csv;charset=utf-8';

export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(rows: readonly (readonly string[])[]): Uint8Array {
  return new TextEncoder().encode(`﻿${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`);
}
