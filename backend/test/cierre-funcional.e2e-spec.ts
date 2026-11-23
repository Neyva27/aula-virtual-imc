/**
 * Cierre funcional (23/11/2026), integración HTTP con la base simulada (sin MySQL): WhatsApp de participantes, niveles de
 * curso, datos completos del certificado e importación masiva (.xlsx y .csv) con vista previa, confirmación y permisos.
 */
import { deflateRawSync } from 'node:zlib';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/seed-data.js';
import { AcademicData } from '../src/modules/academic/academic.data.js';
import { FakePrisma } from './support/fake-prisma.js';
import { CLIENT_HEADER, createTestApp, DEMO_PASSWORD, type TestApp } from './support/test-app.js';

const API = '/api/v1';
const INSTRUCTOR = 'admin@ejemplo.test'; // a1
const OTHER = 'i2@prueba.test';
const HEADER = 'nombres,apellidos,dni,empresa,curso,codigo_certificado,fecha_emision,nivel_curso';

/** ZIP mínimo (deflate) con las partes de un .xlsx; las celdas se pasan como XML para probar fórmulas y tipos. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const cellXml = (value: string, r: number, c: number) => {
  const ref = `${String.fromCharCode(65 + c)}${r}`;
  if (value.startsWith('FORMULA:')) return `<c r="${ref}"><f>${value.slice(8)}</f><v>1</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
};
function xlsx(rows: string[][]): Buffer {
  const body = rows.map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cellXml(v, i + 1, c)).join('')}</row>`).join('');
  return zip({
    'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Hoja" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${body}</sheetData></worksheet>`,
  });
}

describe('Cierre funcional (HTTP, base simulada)', () => {
  let db: FakePrisma;
  let t: TestApp;
  const tokens = new Map<string, string>();
  const token = async (email: string) => {
    if (!tokens.has(email)) {
      const res = await request(t.http).post(`${API}/auth/login`).set(CLIENT_HEADER).send({ email, password: DEMO_PASSWORD });
      tokens.set(email, res.body.accessToken as string);
    }
    return tokens.get(email)!;
  };
  const call = async (email: string, method: 'get' | 'post' | 'put' | 'patch', path: string, body?: object) => {
    const bearer = await token(email); // antes de crear la solicitud: supertest no admite dos a la vez sobre el mismo servidor
    const r = request(t.http)[method](`${API}${path}`).set('Authorization', `Bearer ${bearer}`).set(CLIENT_HEADER);
    return body ? r.send(body) : r;
  };
  const upload = async (path: string, file: Buffer, name: string, fields: Record<string, string> = {}, email = INSTRUCTOR) => {
    const bearer = await token(email);
    let r = request(t.http).post(`${API}/admin/certificate-imports/${path}`).set('Authorization', `Bearer ${bearer}`).set(CLIENT_HEADER);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach('file', file, name);
  };
  let ana: { firstNames: string; lastNames: string; dni: string };
  let luis: { firstNames: string; lastNames: string; dni: string };
  const person = (id: string) => {
    const u = db.users.find((x) => x.id === id)!;
    return { firstNames: u.firstNames as string, lastNames: u.lastNames as string, dni: db.students.find((s) => s.userId === id)!.dni as string };
  };
  const csvRow = (p: typeof ana, code: string, extra: Partial<{ empresa: string; curso: string; fecha: string; nivel: string }> = {}) =>
    [p.firstNames, p.lastNames, p.dni, extra.empresa ?? 'Empresa de demostración', extra.curso ?? 'Trabajo en altura', code, extra.fecha ?? '2026-10-15', extra.nivel ?? 'persona_competente'].join(',');
  const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\r\n'));

  beforeEach(async () => {
    db = new FakePrisma();
    await seedDemo(db as never, DEMO_PASSWORD);
    const passwordHash = db.userByEmail(INSTRUCTOR).passwordHash;
    await db.user.create({ data: { id: 'i2', email: OTHER, role: 'INSTRUCTOR', firstNames: 'Otro', lastNames: 'Instructor', passwordHash } });
    await db.instructor.create({ data: { userId: 'i2' } });
    db.registeredBy('a1', ['u1', 'u2']);
    db.registeredBy('i2', ['u3']);
    await db.instructorPermission.create({ data: { instructorId: 'a1', permission: 'IMC_GENERAL_ADMIN' } });
    await db.course.create({ data: { id: 'c-a1', name: 'Trabajo en altura', createdById: 'a1', status: 'PUBLICADO', level: 'PERSONA_COMPETENTE', trainingHours: 8 } });
    await db.course.create({ data: { id: 'c-old', name: 'Curso anterior', createdById: 'a1', status: 'PUBLICADO' } });
    await db.course.create({ data: { id: 'c-i2', name: 'Curso ajeno', createdById: 'i2', status: 'PUBLICADO', level: 'PERSONA_COMPETENTE' } });
    ana = person('u1');
    luis = person('u2');
    tokens.clear();
    t = await createTestApp(db);
  });
  afterEach(() => t.close());

  describe('WhatsApp de participantes', () => {
    const base = { firstNames: 'Marta', lastNames: 'Rojas Díaz', email: 'marta@prueba.test', dni: '44556677' };

    it('registra con WhatsApp normalizado, edita y quita el número sin duplicar al participante', async () => {
      const created = await call(INSTRUCTOR, 'post', '/students', { ...base, whatsapp: '+51 987-654-321' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.student.whatsapp).toBe('+51987654321');
      const id = created.body.student.id as string;
      const count = db.students.length;
      const edited = await call(INSTRUCTOR, 'patch', `/students/${id}/contact`, { whatsapp: '987111222' });
      expect(edited.status).toBe(200);
      expect(edited.body.whatsapp).toBe('987111222');
      expect((await call(INSTRUCTOR, 'patch', `/students/${id}/contact`, { whatsapp: '' })).body.whatsapp).toBeNull();
      expect(db.students).toHaveLength(count);
      expect(JSON.stringify(db.auditLogs.filter((a) => a.action === 'STUDENT_CONTACT_UPDATED'))).not.toContain('987111222');
    });

    it('rechaza números inválidos y campos no permitidos', async () => {
      for (const whatsapp of ['123', '812345678', '+0123456789', 'abc', '+5198765432112345']) {
        expect((await call(INSTRUCTOR, 'post', '/students', { ...base, whatsapp })).status, whatsapp).toBe(400);
        expect((await call(INSTRUCTOR, 'patch', '/students/u1/contact', { whatsapp })).status, whatsapp).toBe(400);
      }
      expect((await call(INSTRUCTOR, 'patch', '/students/u1/contact', { whatsapp: '987654321', dni: '11111111' })).status).toBe(400);
    });

    it('los registros anteriores siguen funcionando con null; no se edita a un participante ajeno ni siendo estudiante', async () => {
      expect((await call(INSTRUCTOR, 'get', '/students/u1')).body.whatsapp).toBeNull();
      expect((await call(INSTRUCTOR, 'patch', '/students/u3/contact', { whatsapp: '987654321' })).status).toBe(404);
      expect((await call(db.users.find((u) => u.id === 'u1')!.email as string, 'patch', '/students/u1/contact', { whatsapp: '987654321' })).status).toBe(403);
    });
  });

  describe('Niveles de curso', () => {
    const course = { name: 'Curso con nivel', description: 'Descripción', trainingHours: null, coverImage: null };

    it('crea y edita con nivel, consulta por nivel y conserva el nivel al publicar sin indicarlo', async () => {
      const created = await call(INSTRUCTOR, 'post', '/courses', { ...course, level: 'persona_autorizada' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.level).toBe('persona_autorizada');
      const id = created.body.id as string;
      const edited = await call(INSTRUCTOR, 'put', `/courses/${id}`, { ...course, status: 'borrador', level: 'persona_certificada' });
      expect(edited.body.level).toBe('persona_certificada');
      expect((await call(INSTRUCTOR, 'put', `/courses/${id}`, { ...course, status: 'borrador' })).body.level).toBe('persona_certificada');
      const filtered = await call(INSTRUCTOR, 'get', '/courses?level=persona_certificada');
      expect((filtered.body as { id: string }[]).map((c) => c.id)).toEqual([id]);
    });

    it('rechaza valores no permitidos y mantiene los cursos anteriores como pendientes', async () => {
      expect((await call(INSTRUCTOR, 'post', '/courses', { ...course, level: 'experto' })).status).toBe(400);
      expect((await call(INSTRUCTOR, 'put', '/courses/c-old', { ...course, status: 'borrador', level: 'Persona autorizada' })).status).toBe(400);
      expect((await call(INSTRUCTOR, 'get', '/courses?level=otro')).status).toBe(400);
      const pending = (await call(INSTRUCTOR, 'get', '/courses?level=pendiente')).body as { id: string; level: unknown }[];
      expect(pending.map((c) => c.id)).toContain('c-old');
      expect(pending.find((c) => c.id === 'c-old')!.level).toBeNull();
    });
  });

  describe('Datos del certificado', () => {
    it('al emitir guarda nombres, apellidos, DNI, empresa y nivel; el histórico no cambia y la verificación pública no los expone', async () => {
      const attempt = { id: 'att-1', studentId: 'u1', courseId: 'c-a1', examId: 'e', score: 18, scaleMax: 20 };
      await new AcademicData().issueCertificate(db as never, attempt as never, db.courses.find((c) => c.id === 'c-a1') as never);
      const row = db.certificates[0];
      expect(row).toMatchObject({ participantFirstNames: ana.firstNames, participantLastNames: ana.lastNames, participantDni: ana.dni, participantCompany: 'Empresa de demostración', courseLevel: 'PERSONA_COMPETENTE' });
      expect(row.code).toMatch(/^IMC-\d{4}-[0-9A-F]{10}$/);
      const old = { id: 'h1', code: 'IMC-2025-OLD1', studentId: 'u2', courseId: 'c-old', attemptId: 'att-h', participantName: 'Nombre histórico', participantDni: null, courseName: 'Curso anterior', approvalDate: new Date('2025-05-01T15:00:00Z'), issueDate: new Date('2025-05-01T15:00:00Z'), score: 15, scaleMax: 20, trainingHours: null, entityName: 'IMC', status: 'VIGENTE' };
      await db.certificate.create({ data: old });
      const snapshot = { ...db.certificates[1] };
      const list = (await call(INSTRUCTOR, 'get', '/certificates')).body as { code: string; participantName: string; participantCompany?: string }[];
      expect(list.find((c) => c.code === old.code)).toMatchObject({ participantName: 'Nombre histórico' });
      expect(list.find((c) => c.code === old.code)!.participantCompany).toBeUndefined();
      expect(db.certificates[1]).toEqual(snapshot);
      const pub = await request(t.http).get(`${API}/public/certificates/${row.code as string}`);
      expect(pub.status).toBe(200);
      for (const key of ['participantDni', 'participantCompany', 'participantFirstNames']) expect(pub.body[key]).toBeUndefined();
    });
  });

  describe('Importación masiva', () => {
    it('CSV válido: la vista previa no guarda nada; se importa solo tras confirmar, con resumen y registro', async () => {
      const file = csv(csvRow(ana, 'IMP-2026-0001'), csvRow(luis, 'imp-2026-0002', { fecha: '20/10/2026' }));
      const preview = await upload('preview', file, 'certificados.csv');
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body).toMatchObject({ format: 'CSV', total: 2, valid: 2, errors: 0, duplicates: 0 });
      expect(db.certificates).toHaveLength(0);
      expect(db.certificateImports).toHaveLength(0);

      const done = await upload('confirm', file, 'certificados.csv', { fileHash: preview.body.fileHash as string, confirm: 'true' });
      expect(done.status, JSON.stringify(done.body)).toBe(201);
      expect(done.body).toMatchObject({ imported: 2, rejected: 0, duplicates: 0, fileName: 'certificados.csv' });
      expect(done.body.actorName).toBeTruthy();
      expect(done.body.importedAt).toBeTruthy();
      expect(db.certificates.map((c) => c.code as string).sort((a, b) => a.localeCompare(b))).toEqual(['IMP-2026-0001', 'IMP-2026-0002']);
      const imported = db.certificates.find((c) => c.code === 'IMP-2026-0002')!;
      expect(imported).toMatchObject({ studentId: 'u2', courseId: 'c-a1', attemptId: null, score: null, approvalDate: null, participantDni: luis.dni, courseLevel: 'PERSONA_COMPETENTE' });
      expect((imported.issueDate as Date).toISOString()).toBe('2026-10-20T17:00:00.000Z');
      expect(db.actions()).toContain('CERTIFICATES_IMPORTED');
      expect((await call(INSTRUCTOR, 'get', '/admin/certificate-imports')).body).toHaveLength(1);
      expect((await request(t.http).get(`${API}/public/certificates/IMP-2026-0001`)).body.status).toBe('vigente');
      expect((await request(t.http).get(`${API}/public/certificates/dni/${ana.dni}`)).body).toHaveLength(1);
    });

    it('Excel válido (.xlsx), con punto y coma en CSV y BOM', async () => {
      const header = HEADER.split(',');
      const row = csvRow(ana, 'IMP-XLSX-0001').split(',');
      const preview = await upload('preview', xlsx([header, row]), 'certificados.xlsx');
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body).toMatchObject({ format: 'XLSX', total: 1, valid: 1 });
      const semicolon = Buffer.from(`﻿${HEADER.replaceAll(',', ';')}\r\n${csvRow(luis, 'IMP-SEMI-0001').replaceAll(',', ';')}\r\n`);
      expect((await upload('preview', semicolon, 'puntoycoma.csv')).body).toMatchObject({ total: 1, valid: 1 });
      const done = await upload('confirm', xlsx([header, row]), 'certificados.xlsx', { fileHash: preview.body.fileHash as string, confirm: 'true' });
      expect(done.body.imported).toBe(1);
    });

    it('rechaza formatos no admitidos y archivos malformados', async () => {
      const cases: [Buffer, string, RegExp][] = [
        [Buffer.from('hola'), 'datos.pdf', /Formato no admitido/],
        [Buffer.from('no es zip'), 'datos.xlsx', /dañado/],
        [zip({ 'xl/workbook.xml': '<a/>' }), 'datos.xlsx', /dañado/],
        [zip({ 'xl/workbook.xml': '<!DOCTYPE x><a/>', 'xl/_rels/workbook.xml.rels': '<a/>' }), 'datos.xlsx', /XML no permitidas/],
        [zip({ 'xl/vbaProject.bin': 'x', 'xl/workbook.xml': '<a/>' }), 'datos.xlsx', /macros/],
        [Buffer.from('a,b\n1,2\n'), 'datos.csv', /Faltan columnas/],
        [Buffer.from(`${HEADER}\n"sin cerrar`), 'datos.csv', /mal formado/],
        [Buffer.from(`${HEADER},extra\n`), 'datos.csv', /no pertenecen/],
        [Buffer.from([0x61, 0x00, 0x62]), 'datos.csv', /no es un texto/],
      ];
      for (const [file, name, message] of cases) {
        const res = await upload('preview', file, name);
        expect(res.status, name).toBe(400);
        expect(res.body.message, name).toMatch(message);
      }
      expect((await upload('preview', Buffer.alloc(2 * 1024 * 1024 + 1, 97), 'grande.csv')).status).toBe(413);
    });

    it('valida por fila y campo: obligatorios, DNI, curso, empresa, nombres, fecha, nivel, fórmulas y ejemplos', async () => {
      const file = csv(
        ',' + csvRow(ana, 'ERR-0001').split(',').slice(1).join(','),
        csvRow({ ...ana, dni: '123' }, 'ERR-0002'),
        csvRow({ ...ana, dni: '99999999' }, 'ERR-0003'),
        csvRow(ana, 'ERR-0004', { curso: 'Curso inexistente' }),
        csvRow(ana, 'ERR-0005', { curso: 'Curso ajeno' }),
        csvRow(ana, 'ERR-0006', { empresa: 'Otra Empresa' }),
        csvRow({ ...ana, firstNames: 'Distinto' }, 'ERR-0007'),
        csvRow(ana, 'ERR-0008', { fecha: '31/02/2026' }),
        csvRow(ana, 'ERR-0009', { fecha: '2099-01-01' }),
        csvRow(ana, 'ERR-0010', { nivel: 'experto' }),
        csvRow(ana, 'ERR-0011', { nivel: 'persona_autorizada' }),
        csvRow(ana, 'ERR-0012', { curso: 'Curso anterior', nivel: 'persona_autorizada' }),
        csvRow({ ...ana, firstNames: '=HYPERLINK(1)' }, 'ERR-0013'),
        csvRow(ana, 'EJEMPLO-0001'),
        csvRow({ ...person('u3') }, 'ERR-0015'), // participante de otro Instructor
      );
      const { body } = await upload('preview', file, 'errores.csv');
      expect(body).toMatchObject({ total: 15, valid: 0, errors: 15, duplicates: 0 });
      const fieldOf = (row: number) => (body.rows as { row: number; issues: { field: string }[] }[]).find((r) => r.row === row)!.issues.map((i) => i.field);
      expect(fieldOf(2)).toContain('nombres');
      expect(body.missingFields.nombres).toBe(1);
      expect(fieldOf(3)).toContain('dni');
      expect(fieldOf(4)).toContain('dni');
      expect(fieldOf(5)).toContain('curso');
      expect(fieldOf(6)).toContain('curso');
      expect(fieldOf(7)).toContain('empresa');
      expect(fieldOf(8)).toContain('nombres');
      expect(fieldOf(9)).toContain('fecha_emision');
      expect(fieldOf(10)).toContain('fecha_emision');
      expect(fieldOf(11)).toContain('nivel_curso');
      expect(fieldOf(12)).toContain('nivel_curso');
      expect(fieldOf(13)).toContain('nivel_curso');
      expect(fieldOf(14)).toContain('nombres');
      expect(fieldOf(15)).toContain('codigo_certificado');
      expect(fieldOf(16)).toContain('dni');
      const confirm = await upload('confirm', file, 'errores.csv', { fileHash: body.fileHash as string, confirm: 'true' });
      expect(confirm.status).toBe(409);
      expect(db.certificates).toHaveLength(0);
      expect(db.certificateImports).toHaveLength(0);
    });

    it('una fórmula de Excel no se evalúa: la fila se rechaza', async () => {
      const row = csvRow(ana, 'IMP-F-0001').split(',');
      row[0] = 'FORMULA:1+1';
      const { body } = await upload('preview', xlsx([HEADER.split(','), row]), 'formula.xlsx');
      expect(body).toMatchObject({ total: 1, errors: 1, valid: 0 });
      expect(body.rows[0].issues[0].message).toContain('fórmula');
    });

    it('detecta duplicados (archivo, base y participante-curso) e importa solo los válidos', async () => {
      await db.certificate.create({ data: { code: 'YA-EXISTE-01', studentId: 'u3', courseId: 'c-i2', attemptId: 'x', participantName: 'X', participantDni: null, courseName: 'Curso ajeno', approvalDate: new Date(), issueDate: new Date(), score: 1, scaleMax: 20, trainingHours: null, entityName: 'IMC' } });
      const file = csv(
        csvRow(ana, 'DUP-0001'),
        csvRow(luis, 'dup-0001'), // mismo código en el archivo
        csvRow(ana, 'DUP-0003'), // mismo participante y curso
        csvRow(luis, 'YA-EXISTE-01'), // código de otro Instructor
        csvRow(luis, 'DUP-0005'),
      );
      const preview = await upload('preview', file, 'duplicados.csv');
      expect(preview.body).toMatchObject({ total: 5, valid: 2, errors: 0, duplicates: 3 });
      const done = await upload('confirm', file, 'duplicados.csv', { fileHash: preview.body.fileHash as string, confirm: 'true' });
      expect(done.body).toMatchObject({ imported: 2, duplicates: 3, rejected: 0 });
      expect(db.certificates.map((c) => c.code as string).sort((a, b) => a.localeCompare(b))).toEqual(['DUP-0001', 'DUP-0005', 'YA-EXISTE-01']);
      const again = await upload('preview', file, 'duplicados.csv');
      expect(again.body).toMatchObject({ valid: 0, duplicates: 5 });
    });

    it('impide importar sin confirmación expresa o con otro archivo', async () => {
      const file = csv(csvRow(ana, 'CONF-0001'));
      const { body } = await upload('preview', file, 'a.csv');
      expect((await upload('confirm', file, 'a.csv')).status).toBe(400);
      expect((await upload('confirm', file, 'a.csv', { fileHash: body.fileHash as string })).status).toBe(400);
      expect((await upload('confirm', file, 'a.csv', { fileHash: body.fileHash as string, confirm: 'false' })).status).toBe(400);
      expect((await upload('confirm', csv(csvRow(ana, 'CONF-0002')), 'a.csv', { fileHash: body.fileHash as string, confirm: 'true' })).status).toBe(409);
      expect(db.certificates).toHaveLength(0);
    });

    it('solo con el permiso de administración general; sin sesión 401', async () => {
      const file = csv(csvRow(ana, 'PERM-0001'));
      expect((await upload('preview', file, 'a.csv', {}, OTHER)).status).toBe(403);
      expect((await upload('preview', file, 'a.csv', {}, db.users.find((u) => u.id === 'u1')!.email as string)).status).toBe(403);
      expect((await request(t.http).post(`${API}/admin/certificate-imports/preview`).set(CLIENT_HEADER).attach('file', file, 'a.csv')).status).toBe(401);
      expect((await call(OTHER, 'get', '/admin/certificate-imports/template')).status).toBe(403);
    });

    it('transacción: si la base falla a mitad, no queda ningún certificado ni registro', async () => {
      const file = csv(csvRow(ana, 'TX-0001'), csvRow(luis, 'TX-0002'));
      const { body } = await upload('preview', file, 'tx.csv');
      const original = db.certificate.createMany;
      db.certificate.createMany = (async () => {
        await db.certificate.create({ data: { code: 'TX-0001', studentId: 'u1', courseId: 'c-a1' } });
        throw Object.assign(new Error('fallo'), { code: 'P2002' });
      }) as never;
      const res = await upload('confirm', file, 'tx.csv', { fileHash: body.fileHash as string, confirm: 'true' });
      db.certificate.createMany = original;
      expect(res.status).toBe(409);
      expect(db.certificates).toHaveLength(0);
      expect(db.certificateImports).toHaveLength(0);
    });

    it('la plantilla coincide con las columnas esperadas y sus ejemplos no se pueden importar', async () => {
      const { body } = await call(INSTRUCTOR, 'get', '/admin/certificate-imports/template');
      expect((body.columns as string[]).join(',')).toBe(HEADER);
      expect(body.levels).toHaveLength(3);
      const file = Buffer.from([HEADER, ...(body.examples as string[][]).map((r) => r.join(','))].join('\n'));
      expect((await upload('preview', file, 'plantilla.csv')).body).toMatchObject({ total: 2, valid: 0, errors: 2 });
    });

    it('procesa una cantidad considerable de filas (5000) y rechaza una más', async () => {
      const many = Array.from({ length: 5000 }, (_, i) => csvRow(ana, `MUCHOS-${i}`));
      const ok = await upload('preview', csv(...many), 'muchos.csv');
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ total: 5000, valid: 1, duplicates: 4999 });
      const over = await upload('preview', csv(...many, csvRow(ana, 'MUCHOS-X')), 'muchos.csv');
      expect(over.status).toBe(400);
      expect(over.body.message).toContain('5000');
    }, 30_000);
  });
});
