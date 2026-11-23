import { jsPDF } from 'jspdf';

export interface PdfReport {
  title: string;
  /** Líneas de contexto (filtros aplicados, rango de fechas…). */
  subtitle?: string[];
  headers: string[];
  rows: string[][];
  /** Ancho relativo de cada columna (se reparte el ancho útil de la página). */
  widths?: number[];
  footer?: string;
}

const NAVY: [number, number, number] = [10, 30, 80];
const GRAY: [number, number, number] = [91, 101, 121];
const LINE: [number, number, number] = [217, 223, 235];

/**
 * Reporte PDF tabular (18/11/2026), con jsPDF (ya usado por los certificados): A4 horizontal, encabezado repetido en
 * cada página, filas que no se cortan, número de página y fecha de generación. Devuelve el documento (para probarlo)
 * y lo descarga con `save`.
 */
export function buildPdfReport(report: PdfReport): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const M = 14;
  const usable = W - 2 * M;
  const weights = report.widths ?? report.headers.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => (w / total) * usable);
  const generated = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });

  let y = 0;
  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...NAVY);
    doc.text(report.title, M, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    let line = 24;
    for (const s of [...(report.subtitle ?? []), `Generado el ${generated} (hora de Lima) · Aula Virtual IMC`]) {
      doc.text(s, M, line);
      line += 4.5;
    }
    y = line + 2;
    doc.setFillColor(...NAVY);
    doc.rect(M, y, usable, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    let x = M;
    report.headers.forEach((h, i) => {
      doc.text(h, x + 2, y + 4.8, { maxWidth: cols[i] - 4 });
      x += cols[i];
    });
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(23, 32, 51);
  };

  header();
  if (report.rows.length === 0) {
    doc.text('Sin registros para los filtros indicados.', M, y + 7);
  }
  for (const row of report.rows) {
    const lines = row.map((cell, i) => doc.splitTextToSize(cell ?? '', cols[i] - 4) as string[]);
    const height = Math.max(...lines.map((l) => l.length)) * 4.2 + 3;
    if (y + height > H - 16) {
      doc.addPage();
      header();
    }
    let x = M;
    lines.forEach((l, i) => {
      doc.text(l, x + 2, y + 4.5);
      x += cols[i];
    });
    y += height;
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`${report.footer ? `${report.footer} · ` : ''}Página ${p} de ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc;
}
