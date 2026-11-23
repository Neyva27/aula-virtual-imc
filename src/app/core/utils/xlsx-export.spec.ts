import { buildXlsx, crc32, xmlText, zipStored } from './xlsx-export';
import { crc32Bitwise, entryXml, readSheet, readZip } from './testing/read-xlsx';

/**
 * R8: el archivo generado es un .xlsx real: ZIP válido (sin compresión, CRC-32 correcto), paquete mínimo de
 * SpreadsheetML, XML bien formado, celdas de texto y ninguna fórmula. Se lee con un lector independiente.
 */
const HEADERS = ['Estudiante', 'Curso', 'Nota final', 'Estado', 'Certificación'];
const enc = new TextEncoder();

describe('R8: utilidad XLSX', () => {
  it('CRC-32 coincide con valores conocidos y con el cálculo bit a bit', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926); // valor de referencia del CRC-32
    expect(crc32(new Uint8Array())).toBe(0);
    const sample = enc.encode('Evaluación «rendida» — ñandú');
    expect(crc32(sample)).toBe(crc32Bitwise(sample));
  });

  it('el ZIP tiene firmas, directorio central, tamaños y CRC correctos', () => {
    const zip = zipStored([
      { name: 'a.txt', data: enc.encode('hola') },
      { name: 'carpeta/b.xml', data: enc.encode('<x>ñ</x>') },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => [e.name, e.method, new TextDecoder().decode(e.data)])).toEqual([
      ['a.txt', 0, 'hola'],
      ['carpeta/b.xml', 0, '<x>ñ</x>'],
    ]);
  });

  it('contiene el paquete mínimo de un libro de Excel, con XML bien formado y relaciones coherentes', () => {
    const { entries } = readSheet(buildXlsx([HEADERS, ['Ana', 'Curso', '80 / 100', 'Aprobado', 'Certificado emitido']]));
    expect(entries.map((e) => e.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    for (const e of entries) if (e.name.endsWith('.xml') || e.name.endsWith('.rels')) expect(() => entryXml(entries, e.name)).not.toThrow();
    const types = entryXml(entries, '[Content_Types].xml');
    const overrides = [...types.getElementsByTagName('Override')].map((o) => o.getAttribute('PartName'));
    expect(overrides).toEqual(['/xl/workbook.xml', '/xl/worksheets/sheet1.xml', '/xl/styles.xml']);
    const rootRel = entryXml(entries, '_rels/.rels').getElementsByTagName('Relationship')[0];
    expect(rootRel.getAttribute('Target')).toBe('xl/workbook.xml');
    const wbRels = [...entryXml(entries, 'xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')].map((r) => r.getAttribute('Target'));
    expect(wbRels).toEqual(['worksheets/sheet1.xml', 'styles.xml']);
    const sheet = entryXml(entries, 'xl/workbook.xml').getElementsByTagName('sheet')[0];
    expect(sheet.getAttribute('r:id')).toBe('rId1');
  });

  it('encabezados y valores exactos, todas las celdas como texto y sin fórmulas', () => {
    const rows = [HEADERS, ['Ana Torres', 'Curso A', '80 / 100', 'Aprobado', 'Certificado emitido']];
    const { rows: read, formulas } = readSheet(buildXlsx(rows));
    expect(read).toEqual(rows);
    expect(read[0]).toEqual(['Estudiante', 'Curso', 'Nota final', 'Estado', 'Certificación']);
    expect(formulas).toBe(0);
  });

  it('escapa caracteres especiales, conserva acentos y no convierte nada en fórmula', () => {
    const tricky = ['=SUMA(A1:A9)', '+1-2', '@cmd', 'Ñandú & «Peña» <b>"x"</b> \'y\'', 'línea 1\nlínea 2', 'control\u0001\u0008fin'];
    const { rows, formulas, entries } = readSheet(buildXlsx([HEADERS.slice(0, tricky.length), tricky].map((r) => [...r])));
    expect(rows[1]).toEqual(['=SUMA(A1:A9)', '+1-2', '@cmd', 'Ñandú & «Peña» <b>"x"</b> \'y\'', 'línea 1\nlínea 2', 'controlfin']);
    expect(formulas).toBe(0);
    const raw = new TextDecoder().decode(entries.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data);
    expect(raw).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt; &apos;y&apos;');
    expect(raw).not.toContain('<f>');
    expect(xmlText('a&b<c>')).toBe('a&amp;b&lt;c&gt;');
  });

  it('columnas más allá de la Z se nombran como en Excel (AA, AB…)', () => {
    const wide = Array.from({ length: 28 }, (_, i) => `c${i}`);
    const { entries } = readSheet(buildXlsx([wide]));
    const refs = [...entryXml(entries, 'xl/worksheets/sheet1.xml').getElementsByTagName('c')].map((c) => c.getAttribute('r'));
    expect(refs.slice(24)).toEqual(['Y1', 'Z1', 'AA1', 'AB1']);
  });
});
