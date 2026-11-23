import { inflateRawSync } from 'node:zlib';

/**
 * Lectura segura de los archivos de la importación masiva (23/11/2026), sin dependencias nuevas. Nada del archivo se
 * ejecuta: las fórmulas de Excel no se evalúan (la celda se marca y la fila se rechaza) y se rechazan macros, archivos
 * cifrados, DOCTYPE/entidades XML y paquetes ZIP desproporcionados (bombas de compresión).
 */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
const MAX_ZIP_ENTRIES = 200;
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;

export const IMPORT_COLUMNS = ['nombres', 'apellidos', 'dni', 'empresa', 'curso', 'codigo_certificado', 'fecha_emision', 'nivel_curso'] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportFormat = 'XLSX' | 'CSV';

export interface ParsedRow {
  /** Número de fila en el archivo (la 1 es el encabezado). */
  row: number;
  values: Record<ImportColumn, string>;
  /** Columnas con una fórmula o con contenido que una hoja de cálculo interpretaría como fórmula. */
  unsafe: ImportColumn[];
  /** La fila tiene más celdas con contenido que columnas la plantilla. */
  extraCells: boolean;
}

export interface ParsedFile {
  format: ImportFormat;
  rows: ParsedRow[];
}

/** Archivo que no se puede procesar: se rechaza completo (400) con un mensaje comprensible. */
export class ImportFileError extends Error {}

const MALFORMED_XLSX = 'El archivo Excel está dañado o no tiene el formato .xlsx esperado.';
const TOO_MANY_ROWS = `El archivo supera el máximo de ${IMPORT_MAX_ROWS} registros.`;
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const headerKey = (text: string) => fold(text).trim().replace(/[\s-]+/g, '_');
const FORMULA_START = /^[=+\-@\t\r]/;

export function parseImportFile(buffer: Buffer, fileName: string): ParsedFile {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ext !== 'xlsx' && ext !== 'csv') throw new ImportFileError('Formato no admitido. Selecciona un archivo Excel (.xlsx) o CSV (.csv).');
  if (!buffer.length) throw new ImportFileError('El archivo está vacío.');
  if (buffer.length > IMPORT_MAX_BYTES) throw new ImportFileError('El archivo supera el tamaño máximo de 2 MB.');
  const isZip = buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (ext === 'xlsx') {
    if (!isZip) throw new ImportFileError(MALFORMED_XLSX);
    return { format: 'XLSX', rows: toRows(readXlsx(buffer)) };
  }
  if (isZip || buffer.includes(0)) throw new ImportFileError('El archivo CSV no es un texto válido.');
  return { format: 'CSV', rows: toRows(readCsv(buffer)) };
}

interface RawRow {
  row: number;
  cells: string[];
  formulas: Set<number>;
}

function toRows(raw: RawRow[]): ParsedRow[] {
  const header = raw[0];
  if (!header || header.row !== 1) throw new ImportFileError('La primera fila debe contener los encabezados de la plantilla.');
  const keys = header.cells.map(headerKey);
  while (keys.length && !keys[keys.length - 1]) keys.pop();
  const missing = IMPORT_COLUMNS.filter((c) => !keys.includes(c));
  if (missing.length) throw new ImportFileError(`Faltan columnas de la plantilla: ${missing.join(', ')}.`);
  if (keys.some((k) => !(IMPORT_COLUMNS as readonly string[]).includes(k))) {
    throw new ImportFileError('El archivo tiene columnas que no pertenecen a la plantilla.');
  }
  if (new Set(keys).size !== keys.length) throw new ImportFileError('El archivo tiene columnas repetidas.');
  const data = raw.slice(1).filter((r) => r.cells.some((c) => c.trim()) || r.formulas.size);
  if (data.length > IMPORT_MAX_ROWS) throw new ImportFileError(TOO_MANY_ROWS);
  return data.map((r) => {
    const values = {} as Record<ImportColumn, string>;
    const unsafe: ImportColumn[] = [];
    keys.forEach((key, i) => {
      const column = key as ImportColumn;
      const text = r.cells[i] ?? '';
      values[column] = text.trim().replace(/\s+/g, ' ');
      if (r.formulas.has(i) || FORMULA_START.test(text)) unsafe.push(column);
    });
    return { row: r.row, values, unsafe, extraCells: r.cells.slice(keys.length).some((c) => c.trim()) };
  });
}

// ----- CSV (RFC 4180, separador coma o punto y coma) -----

function decodeText(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer); // «CSV» guardado por Excel en español
  }
  return text.replace(/^﻿/, '');
}

function readCsv(buffer: Buffer): RawRow[] {
  const text = decodeText(buffer);
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRow = () => {
    cells.push(cell);
    cell = '';
    rows.push({ row: start, cells, formulas: new Set() });
    if (rows.length > IMPORT_MAX_ROWS + 1) throw new ImportFileError(TOO_MANY_ROWS);
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"') {
      if (cell) throw new ImportFileError(`El archivo CSV está mal formado (comillas en la fila ${line}).`);
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      start = line;
    } else cell += ch;
  }
  if (quoted) throw new ImportFileError('El archivo CSV está mal formado (comillas sin cerrar).');
  if (cell || cells.length) endRow();
  return rows;
}

// ----- XLSX (ZIP + XML) -----

interface ZipEntry {
  method: number;
  offset: number;
  compressed: number;
}

function zipEntries(buffer: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportFileError(MALFORMED_XLSX);
  const count = buffer.readUInt16LE(eocd + 10);
  if (count > MAX_ZIP_ENTRIES) throw new ImportFileError(MALFORMED_XLSX);
  const entries = new Map<string, ZipEntry>();
  let p = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) throw new ImportFileError(MALFORMED_XLSX);
    const flags = buffer.readUInt16LE(p + 8);
    const method = buffer.readUInt16LE(p + 10);
    const compressed = buffer.readUInt32LE(p + 20);
    const size = buffer.readUInt32LE(p + 24);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extra = buffer.readUInt16LE(p + 30);
    const comment = buffer.readUInt16LE(p + 32);
    const offset = buffer.readUInt32LE(p + 42);
    if (p + 46 + nameLen > buffer.length) throw new ImportFileError(MALFORMED_XLSX);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    if (flags & 1) throw new ImportFileError('El archivo Excel está protegido con contraseña: guárdalo sin protección.');
    if (/vbaProject\.bin$/i.test(name)) throw new ImportFileError('El archivo contiene macros y no se admite.');
    if ((method !== 0 && method !== 8) || size > MAX_ENTRY_BYTES) throw new ImportFileError(MALFORMED_XLSX);
    entries.set(name, { method, offset, compressed });
    p += 46 + nameLen + extra + comment;
  }
  return entries;
}

function readEntry(buffer: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name);
  if (!entry) return null;
  const { offset, compressed, method } = entry;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) throw new ImportFileError(MALFORMED_XLSX);
  const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
  if (start + compressed > buffer.length) throw new ImportFileError(MALFORMED_XLSX);
  const data = buffer.subarray(start, start + compressed);
  let out: Buffer;
  try {
    // El límite real lo impone maxOutputLength: el tamaño declarado en el ZIP podría ser falso.
    out = method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  } catch {
    throw new ImportFileError(MALFORMED_XLSX);
  }
  const xml = out.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ImportFileError('El archivo Excel contiene definiciones XML no permitidas.');
  return xml;
}

const unescapeXml = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (all, code: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[code.toLowerCase()]) return named[code.toLowerCase()];
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });

const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));
const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];

function columnIndex(ref: string | undefined, fallback: number): number {
  const letters = ref ? /^[A-Z]+/.exec(ref)?.[0] : undefined;
  if (!letters) return fallback;
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n <= 64 ? n - 1 : -1;
}

function firstSheetPath(buffer: Buffer, entries: Map<string, ZipEntry>): string {
  const workbook = readEntry(buffer, entries, 'xl/workbook.xml');
  const rels = readEntry(buffer, entries, 'xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new ImportFileError(MALFORMED_XLSX);
  const sheet = /<sheet\s([^>]*?)\/?>/.exec(workbook)?.[1];
  const relId = sheet ? attr(sheet, 'r:id') : undefined;
  const rel = [...rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)].map((m) => m[1]).find((a) => attr(a, 'Id') === relId);
  const target = rel ? attr(rel, 'Target') : undefined;
  if (!target) throw new ImportFileError(MALFORMED_XLSX);
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  if (path.includes('..')) throw new ImportFileError(MALFORMED_XLSX);
  return path;
}

function readXlsx(buffer: Buffer): RawRow[] {
  const entries = zipEntries(buffer);
  const sheet = readEntry(buffer, entries, firstSheetPath(buffer, entries));
  if (!sheet) throw new ImportFileError(MALFORMED_XLSX);
  const sharedXml = readEntry(buffer, entries, 'xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) => textOf(m[1] ?? '')) : [];
  const rows: RawRow[] = [];
  let rowIndex = 0;
  for (const m of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    rowIndex = Number(attr(m[1], 'r')) || rowIndex + 1;
    const cells: string[] = [];
    const formulas = new Set<number>();
    let col = 0;
    for (const c of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const index = columnIndex(attr(c[1], 'r'), col);
      if (index < 0) throw new ImportFileError(MALFORMED_XLSX);
      col = index + 1;
      const body = c[2] ?? '';
      if (/<f[\s>/]/.test(body)) formulas.add(index);
      const type = attr(c[1], 't');
      const v = /<v(?:\s[^>]*)?>([^<]*)<\/v>/.exec(body)?.[1] ?? '';
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type !== 'e') value = unescapeXml(v);
      while (cells.length < index) cells.push('');
      cells[index] = value;
    }
    rows.push({ row: rowIndex, cells, formulas });
    if (rows.length > IMPORT_MAX_ROWS + 1) throw new ImportFileError(TOO_MANY_ROWS);
  }
  return rows;
}
