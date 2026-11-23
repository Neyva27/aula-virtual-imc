import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../academic/academic.data.js';
import { limaDate } from '../academic/academic.mappers.js';
import { CERTIFICATE_ENTITY } from '../academic/academic.rules.js';
import { COURSE_LEVEL_LABELS, COURSE_LEVELS, type CourseLevelColumn, levelFromColumn } from '../academic/course-levels.js';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  ImportFileError,
  type ImportColumn,
  type ImportFormat,
  type ParsedFile,
  type ParsedRow,
  parseImportFile,
} from './import-parser.js';

export interface ImportIssue {
  row: number;
  field: ImportColumn | 'fila';
  message: string;
}
export type ImportRowStatus = 'valido' | 'error' | 'duplicado';
export interface ImportPreviewRow {
  row: number;
  status: ImportRowStatus;
  values: Record<ImportColumn, string>;
  issues: ImportIssue[];
}
export interface ImportPreview {
  fileName: string;
  format: ImportFormat;
  fileHash: string;
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  missingFields: Partial<Record<ImportColumn, number>>;
  rows: ImportPreviewRow[];
}

/** Fila lista para guardar: los datos salen de los registros reales, no del archivo. */
interface ReadyRow {
  code: string;
  studentId: string;
  courseId: string;
  firstNames: string;
  lastNames: string;
  dni: string;
  company: string | null;
  courseName: string;
  courseLevel: CourseLevelColumn | null;
  trainingHours: number | null;
  issueDate: Date;
}

const REQUIRED: ImportColumn[] = ['nombres', 'apellidos', 'dni', 'curso', 'codigo_certificado', 'fecha_emision'];
const FIELD_LABELS: Record<ImportColumn, string> = {
  nombres: 'los nombres',
  apellidos: 'los apellidos',
  dni: 'el DNI',
  empresa: 'la empresa',
  curso: 'el curso',
  codigo_certificado: 'el código del certificado',
  fecha_emision: 'la fecha de emisión',
  nivel_curso: 'el nivel del curso',
};
const EXAMPLE_PREFIX = 'EJEMPLO-';
const CHUNK = 500;
const MAX_STORED_ISSUES = 1000;
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const levelKey = (text: string) => fold(text).replace(/[\s-]+/g, '_');

/** Fecha real AAAA-MM-DD, DD/MM/AAAA o número de serie de Excel; se guarda a mediodía de Lima para conservar el día. */
export function parseIssueDate(value: string, format: ImportFormat): string | null {
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const latin = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (latin) [d, m, y] = [Number(latin[1]), Number(latin[2]), Number(latin[3])];
  else if (format === 'XLSX' && /^\d{5}(\.\d+)?$/.test(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/**
 * Importación masiva de certificados (23/11/2026). Solo con el permiso IMC_GENERAL_ADMIN (el controlador) y SOLO sobre los
 * cursos y participantes del propio Instructor: el permiso no amplía el alcance. No crea participantes, cursos ni
 * empresas. La vista previa no escribe nada.
 *
 * Política: importación PARCIAL DE LOS VÁLIDOS en una sola transacción. Las filas con error o duplicadas se omiten y se
 * informan; las válidas se guardan todas o ninguna (si la base falla, no queda nada a medias).
 */
@Injectable()
export class CertificateImportsService {
  constructor(private readonly prisma: PrismaService) {}

  template() {
    return {
      columns: [...IMPORT_COLUMNS],
      required: REQUIRED,
      levels: COURSE_LEVELS.map((value) => ({ value, label: COURSE_LEVEL_LABELS[value] })),
      limits: { maxBytes: IMPORT_MAX_BYTES, maxRows: IMPORT_MAX_ROWS },
      examples: [
        ['Nombre Ejemplo', 'Apellido Ficticio', '00000000', 'Empresa Ficticia S.A.C.', 'Curso de ejemplo', `${EXAMPLE_PREFIX}0001`, '2026-01-15', 'persona_autorizada'],
        ['Otro Ejemplo', 'Apellido Ficticio', '00000000', '', 'Curso de ejemplo', `${EXAMPLE_PREFIX}0002`, '15/01/2026', 'persona_competente'],
      ],
    };
  }

  async preview(actor: AuthUser, buffer: Buffer, fileName: string): Promise<ImportPreview> {
    return (await this.analyze(this.prisma, actor, buffer, fileName)).preview;
  }

  async confirm(actor: AuthUser, ip: string | null, buffer: Buffer, fileName: string, expectedHash: string) {
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (hash !== expectedHash) throw new ConflictException('El archivo cambió desde la vista previa. Vuelve a analizarlo antes de confirmar.');
    try {
      return await this.prisma.$transaction(
        async (db) => {
          // Serializa las importaciones del mismo Instructor: la validación se repite con los datos ya bloqueados.
          await db.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`;
          const { preview, ready } = await this.analyze(db, actor, buffer, fileName);
          if (!ready.length) throw new ConflictException('No hay registros válidos para importar.');
          const user = await db.user.findUnique({ where: { id: actor.id }, select: { firstNames: true, lastNames: true } });
          const actorName = user ? `${user.firstNames} ${user.lastNames}` : '';
          const issues = preview.rows.flatMap((r) => r.issues);
          const record = await db.certificateImport.create({
            data: {
              actorId: actor.id,
              actorName,
              fileName: fileName.slice(0, 255),
              format: preview.format,
              fileHash: hash,
              totalRows: preview.total,
              importedCount: ready.length,
              rejectedCount: preview.errors,
              duplicateCount: preview.duplicates,
              errors: issues.slice(0, MAX_STORED_ISSUES) as never,
            },
          });
          for (const part of chunks(ready)) {
            await db.certificate.createMany({
              data: part.map((r) => ({
                code: r.code,
                studentId: r.studentId,
                courseId: r.courseId,
                attemptId: null,
                participantName: `${r.firstNames} ${r.lastNames}`,
                participantFirstNames: r.firstNames,
                participantLastNames: r.lastNames,
                participantDni: r.dni,
                participantCompany: r.company,
                courseName: r.courseName,
                courseLevel: r.courseLevel,
                approvalDate: null,
                issueDate: r.issueDate,
                score: null,
                scaleMax: null,
                trainingHours: r.trainingHours,
                entityName: CERTIFICATE_ENTITY,
                status: 'VIGENTE' as const,
                importId: record.id,
              })),
            });
          }
          await db.auditLog.create({
            data: {
              action: 'CERTIFICATES_IMPORTED',
              actorId: actor.id,
              entity: 'certificate_import',
              entityId: record.id,
              ip,
              data: { imported: ready.length, rejected: preview.errors, duplicates: preview.duplicates, format: preview.format },
            },
          });
          return {
            id: record.id,
            fileName: record.fileName,
            importedAt: record.createdAt.toISOString(),
            actorName,
            total: preview.total,
            imported: ready.length,
            rejected: preview.errors,
            duplicates: preview.duplicates,
            issues,
          };
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2002') {
        throw new ConflictException('Un código de certificado se registró mientras se importaba. No se guardó nada: vuelve a analizar el archivo.');
      }
      throw error;
    }
  }

  async history(actor: AuthUser) {
    const rows = await this.prisma.certificateImport.findMany({ where: { actorId: actor.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.slice(0, 20).map((r) => ({
      id: r.id,
      fileName: r.fileName,
      format: r.format,
      actorName: r.actorName,
      importedAt: r.createdAt.toISOString(),
      total: r.totalRows,
      imported: r.importedCount,
      rejected: r.rejectedCount,
      duplicates: r.duplicateCount,
    }));
  }

  private async analyze(db: Db, actor: AuthUser, buffer: Buffer, fileName: string): Promise<{ preview: ImportPreview; ready: ReadyRow[] }> {
    let parsed: ParsedFile;
    try {
      parsed = parseImportFile(buffer, fileName);
    } catch (error) {
      if (error instanceof ImportFileError) throw new BadRequestException(error.message);
      throw error;
    }
    const { rows, format } = parsed;
    const refs = await this.loadReferences(db, actor, rows);
    const today = limaDate(new Date());
    const seenCodes = new Set<string>();
    const seenPairs = new Set<string>();
    const ready: ReadyRow[] = [];
    const missingFields: Partial<Record<ImportColumn, number>> = {};

    const out = rows.map((r): ImportPreviewRow => {
      const v = r.values;
      const issues: ImportIssue[] = [];
      const fail = (field: ImportIssue['field'], message: string) => issues.push({ row: r.row, field, message });
      if (r.extraCells) fail('fila', 'La fila tiene más columnas que la plantilla.');
      for (const column of r.unsafe) fail(column, 'Contiene una fórmula o un carácter inicial no permitido (=, +, -, @).');
      const safe = (c: ImportColumn) => !r.unsafe.includes(c);
      for (const column of REQUIRED) {
        if (!v[column] && safe(column)) {
          missingFields[column] = (missingFields[column] ?? 0) + 1;
          fail(column, `Falta ${FIELD_LABELS[column]}.`);
        }
      }
      const dni = safe('dni') ? v.dni : '';
      if (dni && !/^\d{8}$/.test(dni)) fail('dni', 'El DNI debe tener 8 dígitos (guárdalo como texto para conservar los ceros iniciales).');
      const code = safe('codigo_certificado') ? v.codigo_certificado.toUpperCase() : '';
      if (code) {
        if (code.startsWith(EXAMPLE_PREFIX)) fail('codigo_certificado', 'Es una fila de ejemplo de la plantilla: reemplázala o elimínala.');
        else if (!/^[A-Z0-9-]{4,40}$/.test(code)) fail('codigo_certificado', 'El código debe tener de 4 a 40 letras, números o guiones.');
      }
      const day = v.fecha_emision && safe('fecha_emision') ? parseIssueDate(v.fecha_emision, format) : null;
      if (v.fecha_emision && safe('fecha_emision')) {
        if (!day) fail('fecha_emision', 'Fecha no válida. Usa AAAA-MM-DD o DD/MM/AAAA.');
        else if (day > today) fail('fecha_emision', 'La fecha de emisión no puede ser futura.');
        else if (day < '2000-01-01') fail('fecha_emision', 'La fecha de emisión es demasiado antigua.');
      }

      const validDni = /^\d{8}$/.test(dni);
      const student = validDni ? refs.students.get(dni) : undefined;
      if (validDni && !student) fail('dni', 'No hay un participante registrado por ti con ese DNI.');
      if (student) {
        if (v.nombres && safe('nombres') && fold(v.nombres) !== fold(student.firstNames)) fail('nombres', 'Los nombres no coinciden con el participante de ese DNI.');
        if (v.apellidos && safe('apellidos') && fold(v.apellidos) !== fold(student.lastNames)) fail('apellidos', 'Los apellidos no coinciden con el participante de ese DNI.');
        if (safe('empresa')) {
          if (v.empresa && !student.companies.some((c) => fold(c) === fold(v.empresa))) fail('empresa', 'El participante no pertenece a esa empresa.');
          if (!v.empresa && student.companies.length) {
            missingFields.empresa = (missingFields.empresa ?? 0) + 1;
            fail('empresa', 'Falta la empresa: el participante tiene una empresa registrada.');
          }
        }
      }

      const matches = v.curso && safe('curso') ? (refs.courses.get(fold(v.curso)) ?? []) : [];
      if (v.curso && safe('curso') && !matches.length) fail('curso', 'No existe ese curso entre tus cursos.');
      if (matches.length > 1) fail('curso', 'Hay más de un curso tuyo con ese nombre.');
      const course = matches.length === 1 ? matches[0] : undefined;
      if (v.nivel_curso && safe('nivel_curso')) {
        const key = levelKey(v.nivel_curso);
        const level = COURSE_LEVELS.find((l) => l === key);
        if (!level) fail('nivel_curso', 'Nivel no válido: usa persona_autorizada, persona_competente o persona_certificada.');
        else if (course && levelFromColumn(course.level) !== level) {
          fail('nivel_curso', course.level ? 'El nivel no coincide con el nivel del curso.' : 'El curso está pendiente de clasificación: asígnale su nivel antes de importar.');
        }
      }

      const hasError = issues.length > 0;
      const duplicate: { field: ImportIssue['field']; message: string }[] = [];
      if (code) {
        if (refs.existingCodes.has(code)) duplicate.push({ field: 'codigo_certificado', message: 'El código ya está registrado.' });
        else if (seenCodes.has(code)) duplicate.push({ field: 'codigo_certificado', message: 'El código está repetido en el archivo.' });
      }
      if (student && course) {
        const pair = `${student.id}|${course.id}`;
        if (refs.existingPairs.has(pair)) duplicate.push({ field: 'fila', message: 'El participante ya tiene un certificado vigente de este curso.' });
        else if (seenPairs.has(pair)) duplicate.push({ field: 'fila', message: 'El participante y el curso están repetidos en el archivo.' });
      }
      for (const d of duplicate) fail(d.field, d.message);
      const status: ImportRowStatus = hasError ? 'error' : duplicate.length ? 'duplicado' : 'valido';
      if (status === 'valido') {
        // Solo una fila que SÍ se importará reserva su código y su par participante-curso.
        seenCodes.add(code);
        seenPairs.add(`${student!.id}|${course!.id}`);
        ready.push({
          code,
          studentId: student!.id,
          courseId: course!.id,
          firstNames: student!.firstNames,
          lastNames: student!.lastNames,
          dni,
          company: v.empresa ? (student!.companies.find((c) => fold(c) === fold(v.empresa)) ?? null) : null,
          courseName: course!.name,
          courseLevel: course!.level,
          trainingHours: course!.trainingHours,
          issueDate: new Date(`${day}T12:00:00-05:00`),
        });
      }
      return { row: r.row, status, values: v, issues };
    });

    return {
      ready,
      preview: {
        fileName,
        format,
        fileHash: createHash('sha256').update(buffer).digest('hex'),
        total: out.length,
        valid: out.filter((r) => r.status === 'valido').length,
        errors: out.filter((r) => r.status === 'error').length,
        duplicates: out.filter((r) => r.status === 'duplicado').length,
        missingFields,
        rows: out,
      },
    };
  }

  /** Datos de referencia con consultas fijas por lotes (sin N+1), siempre dentro del alcance del Instructor. */
  private async loadReferences(db: Db, actor: AuthUser, rows: ParsedRow[]) {
    const dnis = [...new Set(rows.map((r) => r.values.dni).filter((d) => /^\d{8}$/.test(d)))];
    const codes = [...new Set(rows.map((r) => r.values.codigo_certificado.toUpperCase()).filter(Boolean))];
    const courseRows = (await db.course.findMany({
      where: { createdById: actor.id },
      select: { id: true, name: true, level: true, trainingHours: true },
    })) as { id: string; name: string; level: CourseLevelColumn | null; trainingHours: number | null }[];
    const courses = new Map<string, typeof courseRows>();
    for (const c of courseRows) courses.set(fold(c.name), [...(courses.get(fold(c.name)) ?? []), c]);

    const studentRows: { userId: string; dni: string }[] = [];
    for (const part of chunks(dnis)) {
      studentRows.push(...(await db.student.findMany({ where: { registeredById: actor.id, dni: { in: part } }, select: { userId: true, dni: true } })));
    }
    const users: { id: string; firstNames: string; lastNames: string }[] = [];
    const links: { studentId: string; companyId: string }[] = [];
    const existingPairs = new Set<string>();
    for (const part of chunks(studentRows.map((s) => s.userId))) {
      users.push(...(await db.user.findMany({ where: { id: { in: part } }, select: { id: true, firstNames: true, lastNames: true } })));
      links.push(...(await db.studentCompany.findMany({ where: { studentId: { in: part } }, select: { studentId: true, companyId: true } })));
      const vigentes = await db.certificate.findMany({ where: { studentId: { in: part }, status: 'VIGENTE' }, select: { studentId: true, courseId: true } });
      for (const c of vigentes) existingPairs.add(`${c.studentId}|${c.courseId}`);
    }
    const companyName = new Map<string, string>();
    for (const part of chunks([...new Set(links.map((l) => l.companyId))])) {
      for (const c of await db.company.findMany({ where: { id: { in: part } }, select: { id: true, name: true } })) companyName.set(c.id, c.name);
    }
    const linksOf = new Map<string, string[]>();
    for (const l of links) {
      const name = companyName.get(l.companyId);
      if (name) linksOf.set(l.studentId, [...(linksOf.get(l.studentId) ?? []), name]);
    }
    const userOf = new Map(users.map((u) => [u.id, u]));
    const students = new Map<string, { id: string; firstNames: string; lastNames: string; companies: string[] }>();
    for (const s of studentRows) {
      const u = userOf.get(s.userId);
      if (u) students.set(s.dni, { id: s.userId, firstNames: u.firstNames, lastNames: u.lastNames, companies: linksOf.get(s.userId) ?? [] });
    }
    // El código es único en TODA la plataforma: se compara también con certificados de otros Instructores (sin revelarlos).
    const existingCodes = new Set<string>();
    for (const part of chunks(codes)) {
      for (const c of await db.certificate.findMany({ where: { code: { in: part } }, select: { code: true } })) existingCodes.add(c.code.toUpperCase());
    }
    return { courses, students, existingCodes, existingPairs };
  }
}
