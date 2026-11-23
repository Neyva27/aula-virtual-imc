/**
 * SOLO PARA PRUEBAS (R8). Lector independiente de un .xlsx: recorre el ZIP desde el fin del directorio central,
 * compara cada entrada con su encabezado local, recalcula el CRC-32 con un algoritmo distinto del de la utilidad
 * (bit a bit, sin tabla) y lee la hoja con DOMParser. Así la prueba no se valida con el mismo código que genera.
 */
export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  data: Uint8Array;
}

/** CRC-32 bit a bit (polinomio 0xEDB88320), independiente de la implementación con tabla. */
export function crc32Bitwise(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endAt = bytes.length - 22;
  if (view.getUint32(endAt, true) !== 0x06054b50) throw new Error('Falta el fin del directorio central');
  const count = view.getUint16(endAt + 10, true);
  const centralSize = view.getUint32(endAt + 12, true);
  let p = view.getUint32(endAt + 16, true);
  if (p + centralSize !== endAt) throw new Error('El directorio central no ocupa el espacio declarado');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error(`Entrada central ${i} sin firma`);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localAt = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // Encabezado local: debe coincidir con el central.
    if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error(`${name}: encabezado local sin firma`);
    if (view.getUint32(localAt + 14, true) !== crc) throw new Error(`${name}: CRC distinto en el encabezado local`);
    if (view.getUint32(localAt + 18, true) !== compressed || view.getUint32(localAt + 22, true) !== size) {
      throw new Error(`${name}: tamaños distintos en el encabezado local`);
    }
    const localName = view.getUint16(localAt + 26, true);
    const localExtra = view.getUint16(localAt + 28, true);
    const start = localAt + 30 + localName + localExtra;
    const data = bytes.subarray(start, start + compressed);
    if (method !== 0 || compressed !== size) throw new Error(`${name}: se esperaba sin compresión`);
    if (crc32Bitwise(data) !== crc) throw new Error(`${name}: el CRC-32 no coincide con el contenido`);
    entries.push({ name, method, crc, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** XML de una entrada, validado con DOMParser (lanza un error si no es XML bien formado). */
export function entryXml(entries: ZipEntry[], name: string): Document {
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new Error(`Falta la entrada ${name}`);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(entry.data);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`${name}: XML mal formado`);
  return doc;
}

/** Filas de la primera hoja como texto (celda por celda) y la cantidad de fórmulas (`<f>`) encontradas. */
export function readSheet(bytes: Uint8Array): { rows: string[][]; formulas: number; entries: ZipEntry[] } {
  const entries = readZip(bytes);
  const sheet = entryXml(entries, 'xl/worksheets/sheet1.xml');
  const rows = [...sheet.getElementsByTagName('row')].map((row) =>
    [...row.getElementsByTagName('c')].map((c) => {
      if (c.getAttribute('t') !== 'inlineStr') throw new Error(`Celda ${c.getAttribute('r')} no es texto`);
      return [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('');
    }),
  );
  return { rows, formulas: sheet.getElementsByTagName('f').length, entries };
}
