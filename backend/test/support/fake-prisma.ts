/**
 * Base de datos SIMULADA en memoria para las pruebas unitarias y de integración HTTP.
 * Implementa solo las operaciones de Prisma que usan B1.1 y B2.1, con su misma forma (where, data, select).
 * B2.1: perfiles de Instructor, empresas de estudiantes e instructores (claves compuestas y claves foráneas
 * simuladas), cursos y matrículas.
 * B2.2a: permisos administrativos especiales de los instructores (`instructorPermission`).
 * B2.2c: borrado de asignaciones de instructores y transacciones con reversión.
 * B2.3c: enlaces de activación (`accountActivationToken`), comparaciones `gt`/`lt` y `activationPending`.
 * B2.2b: gestión de empresas (búsqueda con `contains`, orden por nombre, actualización y unicidad de nombre y RUC).
 * Las pruebas contra MySQL real están en test/db/ (npm run test:db).
 */
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;
type Select = Record<string, any> | undefined;

/**
 * Filtros de Prisma usados por B1.1 y B2.1: igualdad, null, OR, NOT, in, startsWith y endsWith (sin distinguir
 * mayúsculas, como MySQL) y claves únicas compuestas (`{ studentId_companyId: { studentId, companyId } }`).
 */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Row[]).some((w) => matches(row, w));
    if (key === 'NOT') return !matches(row, value as Row);
    if (value === null) return row[key] == null;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const field = row[key];
      if ('in' in value) return (value.in as unknown[]).includes(field);
      // B2.3c: comparaciones (fechas o números).
      if ('gt' in value || 'lt' in value) {
        const n = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
        if (field == null) return false;
        return ('gt' in value ? n(field) > n(value.gt) : true) && ('lt' in value ? n(field) < n(value.lt) : true);
      }
      const text = String(field ?? '').toLowerCase();
      if ('contains' in value) return text.includes(String(value.contains).toLowerCase());
      if ('startsWith' in value) return text.startsWith(String(value.startsWith).toLowerCase());
      if ('endsWith' in value) return text.endsWith(String(value.endsWith).toLowerCase());
      if (!(key in row)) return matches(row, value as Row); // clave compuesta
    }
    return row[key] === value;
  });
}

/** Proyección `select` de una fila plana (sin relaciones). */
function pick(row: Row | undefined, select: Select): Row | null {
  if (!row) return null;
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, v]) => v).map(([k]) => [k, row[k]]));
}

function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) row[key] = (row[key] ?? 0) + value.increment;
    else row[key] = value;
  }
  if ('updatedAt' in row) row.updatedAt = new Date();
}

export class FakePrisma {
  users: Row[] = [];
  companies: Row[] = [];
  students: Row[] = [];
  instructors: Row[] = [];
  studentCompanies: Row[] = [];
  instructorCompanies: Row[] = [];
  instructorPermissions: Row[] = [];
  courses: Row[] = [];
  enrollments: Row[] = [];
  refreshTokens: Row[] = [];
  activationTokens: Row[] = [];
  auditLogs: Row[] = [];
  // Módulo académico (18/11/2026)
  courseModules: Row[] = [];
  courseVideos: Row[] = [];
  videoProgressRows: Row[] = [];
  exams: Row[] = [];
  examQuestions: Row[] = [];
  examStarts: Row[] = [];
  examAttempts: Row[] = [];
  certificates: Row[] = [];
  certificateImports: Row[] = [];
  /** Sesiones en vivo (20/11/2026). */
  liveSessions: Row[] = [];
  /** Recuperaciones de examen (21/11/2026). */
  examRecoveries: Row[] = [];
  /** Simula MySQL caído (health check). */
  databaseDown = false;

  /**
   * SOLO PRUEBAS (regla del 17/11/2026): indica qué Instructor registró a los estudiantes indicados. La semilla de
   * demostración no lo indica (los estudiantes existentes no se asignan a nadie), así que cada escenario lo declara.
   */
  registeredBy(instructorId: string, studentIds: string[]): void {
    for (const id of studentIds) {
      const row = this.students.find((s) => s.userId === id);
      if (!row) throw new Error(`Estudiante inexistente en el escenario: ${id}`);
      row.registeredById = instructorId;
    }
  }

  private project(row: Row | undefined, select: Select, table: 'user' | 'student' | 'company' | 'studentCompany'): Row | null {
    if (!row) return null;
    if (!select) return { ...row };
    const out: Row = {};
    for (const [key, value] of Object.entries(select)) {
      if (!value) continue;
      if (table === 'user' && key === 'student') {
        out.student = this.project(this.students.find((s) => s.userId === row.id), value.select, 'student');
      } else if (table === 'student' && key === 'companies') {
        const links = this.studentCompanies.filter((l) => l.studentId === row.userId);
        const byName = (l: Row) => String(this.companies.find((c) => c.id === l.companyId)?.name ?? '');
        if (value.orderBy?.company?.name) links.sort((a, b) => byName(a).localeCompare(byName(b)));
        out.companies = links.map((l) => this.project(l, value.select, 'studentCompany'));
      } else if (table === 'studentCompany' && key === 'company') {
        out.company = this.project(this.companies.find((c) => c.id === row.companyId), value.select, 'company');
      } else {
        out[key] = row[key];
      }
    }
    return out;
  }

  /** Clave foránea simulada: la fila referida debe existir (MySQL rechazaría la inserción). */
  private requireRow(rows: Row[], where: Row, what: string): void {
    if (!rows.some((r) => matches(r, where))) throw new Error(`Clave foránea: ${what} inexistente`);
  }

  user = {
    findUnique: async ({ where, select }: { where: Row; select?: Select }) =>
      this.project(this.users.find((u) => matches(u, where)), select, 'user'),
    count: async ({ where }: { where?: Row } = {}) => this.users.filter((u) => matches(u, where)).length,
    /** Sin `orderBy`, ordena por id (comportamiento anterior). B2.3a: `orderBy` (objeto o lista) y `skip` (paginación). */
    findMany: async ({ where, select, take, skip, orderBy }: { where?: Row; select?: Select; take?: number; skip?: number; orderBy?: Row | Row[] } = {}) => {
      const order = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o)) : [['id', 'asc']];
      const compare = (a: Row, b: Row) => {
        for (const [field, dir] of order) {
          const diff = String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'es');
          if (diff) return dir === 'desc' ? -diff : diff;
        }
        return 0;
      };
      return this.users
        .filter((u) => matches(u, where))
        .sort(compare)
        .slice(skip ?? 0, (skip ?? 0) + (take ?? Infinity))
        .map((u) => this.project(u, select, 'user')!);
    },
    create: async ({ data, select }: { data: Row; select?: Select }) => {
      if (this.users.some((u) => u.email === data.email || u.id === data.id)) throw uniqueError('users');
      const { instructor, ...fields } = data;
      const row = {
        id: randomUUID(),
        active: true,
        mustChangePassword: false,
        activationPending: false,
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: null,
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...fields,
      };
      this.users.push(row);
      // B2.1: creación anidada del perfil de Instructor (`instructor: { create: {} }`).
      if (instructor?.create) this.instructors.push({ userId: row.id, createdAt: new Date(), updatedAt: new Date() });
      return this.project(row, select, 'user')!;
    },
    update: async ({ where, data, select }: { where: Row; data: Row; select?: Select }) => {
      const row = this.users.find((u) => matches(u, where));
      if (!row) throw new Error('Registro no encontrado');
      applyData(row, data);
      return this.project(row, select, 'user');
    },
  };

  /** Nombre y RUC únicos SIN distinguir mayúsculas, como la intercalación utf8mb4_unicode_ci de MySQL. */
  private companyClash(data: Row, exceptId?: string): boolean {
    const same = (a: unknown, b: unknown) =>
      typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
    return this.companies.some((c) => c.id !== exceptId && (same(c.name, data.name) || same(c.ruc, data.ruc)));
  }

  company = {
    findUnique: async ({ where, select }: { where: Row; select?: Select }) =>
      this.project(this.companies.find((c) => matches(c, where)), select, 'company'),
    findFirst: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.project(this.companies.find((c) => matches(c, where)), select, 'company'),
    findMany: async ({ where, select, orderBy }: { where?: Row; select?: Select; orderBy?: Row } = {}) => {
      const rows = this.companies.filter((c) => matches(c, where));
      if (orderBy?.name) rows.sort((a, b) => String(a.name).localeCompare(String(b.name)) * (orderBy.name === 'desc' ? -1 : 1));
      return rows.map((c) => this.project(c, select, 'company')!);
    },
    count: async ({ where }: { where?: Row } = {}) => this.companies.filter((c) => matches(c, where)).length,
    create: async ({ data, select }: { data: Row; select?: Select }) => {
      if (this.companyClash(data)) throw uniqueError('companies');
      const row = { id: randomUUID(), active: true, contactEmail: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.companies.push(row);
      return this.project(row, select, 'company')!;
    },
    update: async ({ where, data, select }: { where: Row; data: Row; select?: Select }) => {
      const row = this.companies.find((c) => matches(c, where));
      if (!row) throw new Error('Registro no encontrado');
      if (this.companyClash(data, row.id)) throw uniqueError('companies');
      applyData(row, data);
      return this.project(row, select, 'company')!;
    },
  };

  student = {
    findUnique: async ({ where }: { where: Row }) => this.project(this.students.find((s) => matches(s, where)), undefined, 'student'),
    /** B2.3a: lectura plana (DNI y búsqueda por DNI). */
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.students.filter((s) => matches(s, where)).map((s) => pick(s, select)!),
    count: async ({ where }: { where?: Row } = {}) => this.students.filter((s) => matches(s, where)).length,
    create: async ({ data }: { data: Row }) => {
      // B2.1: el estudiante ya no tiene `companyId`; sus empresas van en `studentCompany`.
      if ('companyId' in data) throw new Error('Campo desconocido: companyId (retirado en B2.1)');
      if (this.students.some((s) => s.userId === data.userId || s.dni === data.dni)) throw uniqueError('students');
      // 17/11/2026: quién lo registró (NULL por defecto, como en MySQL; clave foránea a users).
      if (data.registeredById != null) this.requireRow(this.users, { id: data.registeredById }, 'usuario que registra');
      const row = { registeredById: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.students.push(row);
      return { ...row };
    },
    /** Solo para preparar escenarios de prueba (por ejemplo, indicar quién registró a un estudiante de la semilla). */
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = this.students.find((s) => matches(s, where));
      if (!row) throw new Error('Registro no encontrado');
      applyData(row, data);
      return { ...row };
    },
  };

  instructor = {
    findUnique: async ({ where }: { where: Row }) => pick(this.instructors.find((i) => matches(i, where)), undefined),
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.instructors.filter((i) => matches(i, where)).map((i) => pick(i, select)!),
    create: async ({ data }: { data: Row }) => {
      this.requireRow(this.users, { id: data.userId }, 'usuario');
      if (this.instructors.some((i) => i.userId === data.userId)) throw uniqueError('instructors');
      const row = { createdAt: new Date(), updatedAt: new Date(), ...data };
      this.instructors.push(row);
      return { ...row };
    },
  };

  studentCompany = {
    findUnique: async ({ where, select }: { where: Row; select?: Select }) =>
      pick(this.studentCompanies.find((l) => matches(l, where)), select),
    findFirst: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      pick(this.studentCompanies.find((l) => matches(l, where)), select),
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.studentCompanies.filter((l) => matches(l, where)).map((l) => pick(l, select)!),
    count: async ({ where }: { where?: Row } = {}) => this.studentCompanies.filter((l) => matches(l, where)).length,
    create: async ({ data }: { data: Row }) => {
      this.requireRow(this.students, { userId: data.studentId }, 'estudiante');
      this.requireRow(this.companies, { id: data.companyId }, 'empresa');
      if (this.studentCompanies.some((l) => l.studentId === data.studentId && l.companyId === data.companyId)) {
        throw uniqueError('student_companies');
      }
      const row = { assignedById: null, assignedAt: new Date(), ...data };
      this.studentCompanies.push(row);
      return { ...row };
    },
    /** B2.3b: borra UNA fila por su clave compuesta; si no existe falla como Prisma (P2025). */
    delete: async ({ where }: { where: Row }) => {
      const index = this.studentCompanies.findIndex((l) => matches(l, where));
      if (index < 0) throw Object.assign(new Error('Registro no encontrado'), { code: 'P2025' });
      const [row] = this.studentCompanies.splice(index, 1);
      return { ...row };
    },
  };

  instructorCompany = {
    findUnique: async ({ where, select }: { where: Row; select?: Select }) =>
      pick(this.instructorCompanies.find((l) => matches(l, where)), select),
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.instructorCompanies.filter((l) => matches(l, where)).map((l) => pick(l, select)!),
    create: async ({ data }: { data: Row }) => {
      this.requireRow(this.instructors, { userId: data.instructorId }, 'perfil de Instructor');
      this.requireRow(this.companies, { id: data.companyId }, 'empresa');
      if (this.instructorCompanies.some((l) => l.instructorId === data.instructorId && l.companyId === data.companyId)) {
        throw uniqueError('instructor_companies');
      }
      const row = { assignedById: null, assignedAt: new Date(), ...data };
      this.instructorCompanies.push(row);
      return { ...row };
    },
    /** B2.2c: borra UNA fila por su clave compuesta; si no existe falla como Prisma (P2025). */
    delete: async ({ where }: { where: Row }) => {
      const index = this.instructorCompanies.findIndex((l) => matches(l, where));
      if (index < 0) throw Object.assign(new Error('Registro no encontrado'), { code: 'P2025' });
      const [row] = this.instructorCompanies.splice(index, 1);
      return { ...row };
    },
  };

  /** B2.2a: clave primaria (instructor, permiso); FK a `instructors` y, si se indica, a quien lo otorgó. */
  instructorPermission = {
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.instructorPermissions.filter((p) => matches(p, where)).map((p) => pick(p, select)!),
    count: async ({ where }: { where?: Row } = {}) => this.instructorPermissions.filter((p) => matches(p, where)).length,
    create: async ({ data }: { data: Row }) => {
      this.requireRow(this.instructors, { userId: data.instructorId }, 'perfil de Instructor');
      if (data.grantedById != null) this.requireRow(this.users, { id: data.grantedById }, 'usuario que otorga');
      if (this.instructorPermissions.some((p) => p.instructorId === data.instructorId && p.permission === data.permission)) {
        throw uniqueError('instructor_permissions');
      }
      const row = { grantedById: null, grantedAt: new Date(), ...data };
      this.instructorPermissions.push(row);
      return { ...row };
    },
  };

  /**
   * Módulo académico (18/11/2026): tabla genérica con los filtros de `matches`, valores por defecto, índices únicos
   * (P2002) y claves foráneas mínimas. Las consultas del módulo académico son planas (sin relaciones anidadas).
   */
  private table(
    name: AcademicTable,
    defaults: () => Row,
    options: { unique?: string[][]; hasId?: boolean; beforeCreate?: (data: Row) => void } = {},
  ) {
    const rows = () => this[name];
    const clash = (data: Row, except?: Row) =>
      (options.unique ?? []).some((keys) => rows().some((r) => r !== except && keys.every((k) => data[k] != null && r[k] === data[k])));
    return {
      findUnique: async ({ where, select }: { where: Row; select?: Select }) => pick(rows().find((r) => matches(r, where)), select),
      findFirst: async ({ where, select }: { where?: Row; select?: Select } = {}) => pick(rows().find((r) => matches(r, where)), select),
      findMany: async ({ where, select, orderBy }: { where?: Row; select?: Select; orderBy?: Row } = {}) => {
        const list = rows().filter((r) => matches(r, where));
        if (orderBy) {
          const [[field, dir]] = Object.entries(orderBy);
          list.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
        }
        return list.map((r) => pick(r, select)!);
      },
      count: async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where)).length,
      create: async ({ data, select }: { data: Row; select?: Select }) => {
        options.beforeCreate?.(data);
        const row: Row = { ...(options.hasId === false ? {} : { id: randomUUID() }), ...defaults(), ...data };
        if (clash(row)) throw uniqueError(name);
        rows().push(row);
        return pick(row, select)!;
      },
      update: async ({ where, data, select }: { where: Row; data: Row; select?: Select }) => {
        const row = rows().find((r) => matches(r, where));
        if (!row) throw Object.assign(new Error('Registro no encontrado'), { code: 'P2025' });
        if (clash({ ...row, ...data }, row)) throw uniqueError(name);
        applyData(row, data);
        return pick(row, select)!;
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const item of data) {
          const row: Row = { ...(options.hasId === false ? {} : { id: randomUUID() }), ...defaults(), ...item };
          if (clash(row)) throw uniqueError(name);
          rows().push(row);
        }
        return { count: data.length };
      },
      updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
        const list = rows().filter((r) => matches(r, where));
        list.forEach((r) => applyData(r, data));
        return { count: list.length };
      },
      delete: async ({ where }: { where: Row }) => {
        const index = rows().findIndex((r) => matches(r, where));
        if (index < 0) throw Object.assign(new Error('Registro no encontrado'), { code: 'P2025' });
        const [row] = rows().splice(index, 1);
        return { ...row };
      },
      deleteMany: async ({ where }: { where?: Row } = {}) => {
        const keep = rows().filter((r) => !matches(r, where));
        const count = rows().length - keep.length;
        this[name] = keep;
        return { count };
      },
    };
  }

  private stamps = () => ({ createdAt: new Date(), updatedAt: new Date() });

  course = this.table('courses', () => ({
    description: '',
    status: 'BORRADOR',
    trainingHours: null,
    level: null,
    coverImage: null,
    active: true,
    createdById: null,
    ...this.stamps(),
  }));

  enrollment = this.table('enrollments', () => ({ assignedById: null, assignedAt: new Date(), status: 'PENDIENTE', startedAt: null }), {
    unique: [['studentId', 'courseId']],
    beforeCreate: (data) => {
      this.requireRow(this.students, { userId: data.studentId }, 'estudiante');
      this.requireRow(this.courses, { id: data.courseId }, 'curso');
    },
  });

  courseModule = this.table('courseModules', () => ({ description: null, ...this.stamps() }));
  courseVideo = this.table('courseVideos', () => ({
    description: null,
    published: false,
    sourceKind: 'PLACEHOLDER',
    sourceRef: null,
    sourceCredit: null,
    materialUrl: null,
    ...this.stamps(),
  }));
  videoProgress = this.table('videoProgressRows', () => ({ completedAt: new Date() }), { unique: [['enrollmentId', 'videoId']], hasId: false });
  exam = this.table('exams', () => ({ active: true, kind: 'REGULAR', parentExamId: null, availableFrom: null, ...this.stamps() }));
  examQuestion = this.table('examQuestions', () => ({ selectCount: null, rubric: null, ...this.stamps() }));
  examStart = this.table('examStarts', () => ({ answers: null, answersUpdatedAt: null, closedAt: null, attemptId: null }), {
    unique: [['studentId', 'examId']],
  });
  examAttempt = this.table(
    'examAttempts',
    () => ({ kind: 'REGULAR', submittedAt: new Date(), gradingRule: 'PROPORCIONAL', autoSubmitted: false, reviewStatus: null, manualScores: null, gradedAt: null }),
    { unique: [['studentId', 'examId', 'kind']] },
  );
  certificate = this.table('certificates', () => ({ status: 'VIGENTE' }), { unique: [['code'], ['attemptId']] });
  certificateImport = this.table('certificateImports', () => ({ createdAt: new Date() }));
  examRecovery = this.table(
    'examRecoveries',
    () => ({
      reason: 'DESAPROBADO',
      authorizedById: null,
      authorizedAt: new Date(),
      cancelledAt: null,
      startedAt: null,
      endsAt: null,
      answers: null,
      answersUpdatedAt: null,
      closedAt: null,
      attemptId: null,
      noShowAt: null,
      ...this.stamps(),
    }),
    { unique: [['attemptId']] },
  );
  courseLiveSession = this.table('liveSessions', () => ({ moduleId: null, description: null, recordingUrl: null, status: 'PROGRAMADA', createdById: null, ...this.stamps() }));

  /** B2.3c: hash único del token; FK al usuario (y a quien lo emitió, si se indica). */
  accountActivationToken = {
    findFirst: async ({ where, select }: { where?: Row; select?: Select; orderBy?: Row } = {}) => {
      const list = this.activationTokens.filter((r) => matches(r, where));
      return pick(list[list.length - 1], select); // las filas se agregan en orden de creación
    },
    findUnique: async ({ where, select }: { where: Row; select?: Select }) =>
      pick(this.activationTokens.find((t) => matches(t, where)), select),
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) =>
      this.activationTokens.filter((t) => matches(t, where)).map((t) => pick(t, select)!),
    count: async ({ where }: { where?: Row } = {}) => this.activationTokens.filter((t) => matches(t, where)).length,
    create: async ({ data }: { data: Row }) => {
      this.requireRow(this.users, { id: data.userId }, 'usuario');
      if (data.issuedById != null) this.requireRow(this.users, { id: data.issuedById }, 'usuario que emite');
      if (this.activationTokens.some((t) => t.tokenHash === data.tokenHash)) throw uniqueError('account_activation_tokens');
      const row = { id: randomUUID(), usedAt: null, revokedAt: null, issuedById: null, createdAt: new Date(), ...data };
      this.activationTokens.push(row);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = this.activationTokens.filter((t) => matches(t, where));
      rows.forEach((row) => applyData(row, data));
      return { count: rows.length };
    },
  };

  refreshToken = {
    findUnique: async ({ where }: { where: Row }) => {
      const row = this.refreshTokens.find((t) => matches(t, where));
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), createdAt: new Date(), revokedAt: null, revokedReason: null, replacedById: null, ...data };
      this.refreshTokens.push(row);
      return { ...row };
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = this.refreshTokens.find((t) => matches(t, where));
      if (!row) throw new Error('Registro no encontrado');
      applyData(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = this.refreshTokens.filter((t) => matches(t, where));
      rows.forEach((row) => applyData(row, data));
      return { count: rows.length };
    },
  };

  auditLog = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.auditLogs.push(row);
      return row;
    },
    findMany: async ({ where, select }: { where?: Row; select?: Select } = {}) => {
      const { createdAt, ...rest } = where ?? {};
      const since = (createdAt as { gte?: Date } | undefined)?.gte?.getTime() ?? 0;
      return this.auditLogs
        .filter((a) => matches(a, rest) && (a.createdAt as Date).getTime() >= since)
        .reverse()
        .map((a) => pick(a, select)!);
    },
  };

  /** B2.3b: consultas SQL directas recibidas (texto con `?` en lugar de los valores, y los valores), en orden. */
  rawQueries: { sql: string; values: unknown[] }[] = [];
  /** B2.3b: opciones de cada transacción (por ejemplo, el nivel de aislamiento), en orden. */
  transactionOptions: (Row | undefined)[] = [];
  private transactionQueue: Promise<unknown> = Promise.resolve();

  async $queryRaw(strings?: TemplateStringsArray, ...values: unknown[]): Promise<unknown> {
    if (this.databaseDown) throw new Error('connect ECONNREFUSED 127.0.0.1:3306');
    if (strings) this.rawQueries.push({ sql: strings.join('?').replace(/\s+/g, ' ').trim(), values });
    return [{ 1: 1 }];
  }

  /**
   * B2.2c: transacción con reversión, como MySQL. Si la función falla, se restauran todas las tablas al estado previo
   * (copia de cada fila), de modo que las pruebas puedan comprobar que no queda nada aplicado a medias.
   * B2.3b: las transacciones simuladas se ejecutan realmente de una en una (cola), lo que equivale a un bloqueo total;
   * no simula el aislamiento de MySQL. Las pruebas comprueban por separado que el código pide el bloqueo de fila y el
   * nivel de aislamiento (rawQueries y transactionOptions).
   */
  async $transaction<T>(fn: (tx: this) => Promise<T>, options?: Row): Promise<T> {
    this.transactionOptions.push(options);
    const run = async (): Promise<T> => {
      const snapshot = TABLES.map((table) => [table, this[table].map((row) => ({ ...row }))] as const);
      try {
        return await fn(this);
      } catch (error) {
        for (const [table, rows] of snapshot) this[table] = rows;
        throw error;
      }
    };
    const result = this.transactionQueue.then(run, run);
    this.transactionQueue = result.catch(() => undefined);
    return result;
  }

  async $disconnect(): Promise<void> {}

  // Utilidades para las pruebas
  userByEmail(email: string): Row {
    const row = this.users.find((u) => u.email === email);
    if (!row) throw new Error(`No existe ${email}`);
    return row;
  }

  actions(): string[] {
    return this.auditLogs.map((a) => a.action);
  }
}

/** Tablas que se restauran al revertir una transacción simulada. */
const TABLES = [
  'users',
  'companies',
  'students',
  'instructors',
  'studentCompanies',
  'instructorCompanies',
  'instructorPermissions',
  'courses',
  'enrollments',
  'refreshTokens',
  'activationTokens',
  'auditLogs',
  'courseModules',
  'courseVideos',
  'videoProgressRows',
  'exams',
  'examQuestions',
  'examStarts',
  'examAttempts',
  'certificates',
  'certificateImports',
  'liveSessions',
  'examRecoveries',
] as const;

/** Tablas del módulo académico gestionadas con la tabla genérica. */
type AcademicTable =
  | 'courses'
  | 'enrollments'
  | 'courseModules'
  | 'courseVideos'
  | 'videoProgressRows'
  | 'exams'
  | 'examQuestions'
  | 'examStarts'
  | 'examAttempts'
  | 'certificates'
  | 'certificateImports'
  | 'liveSessions'
  | 'examRecoveries';

function uniqueError(table: string): Error {
  return Object.assign(new Error(`Unique constraint failed on ${table}`), { code: 'P2002' });
}
