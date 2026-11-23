import { Company, normalizeRole, splitFullName, User } from '../models/user.model';
import { ExamStart, Recovery } from '../models/recovery.model';
import { Course, CourseModule, CourseRecord, Enrollment, LiveSession, VideoRecord, VideoSource } from '../models/course.model';
import { Attempt, Exam, ExamConfig, ExamQuestion, Question } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';

/** Colecciones que no cambian entre v3 y v4. */
interface DemoCollections {
  courses: CourseRecord[];
  modules: CourseModule[];
  videos: VideoRecord[];
  exams: Exam[];
  questions: ExamQuestion[];
  enrollments: Enrollment[];
  attempts: Attempt[];
  certificates: Certificate[];
}

/**
 * Etapa 2B, Bloque 2 (R1): colecciones agregadas a v4 sin cambiar la versión ni la clave `imc-demo-state-v4`.
 * Los datos guardados antes no las tienen: se completan al leer con `normalizeDemoState`, solo en memoria.
 */
export interface RecoveryCollections {
  companies: Company[];
  recoveries: Recovery[];
  examStarts: ExamStart[];
  /** Clases en vivo (20/11/2026). Se guardan sin el título del módulo, que se calcula al leer. */
  liveSessions: StoredLiveSession[];
}

export type StoredLiveSession = Omit<LiveSession, 'moduleTitle' | 'moduleOrder'>;

const RECOVERY_COLLECTIONS: (keyof RecoveryCollections)[] = ['companies', 'recoveries', 'examStarts', 'liveSessions'];

/**
 * Estado de la demostración en localStorage (v4, B1.2): colecciones planas, como las futuras tablas.
 * Respecto de v3: el rol «admin» pasa a «instructor» y cada usuario tiene nombres y apellidos separados.
 * En memoria siempre tiene las colecciones del Bloque 2 (ver `StoredDemoState`).
 */
export interface DemoState extends DemoCollections, RecoveryCollections {
  version: 4;
  users: User[];
}

/** v4 tal como puede estar guardado: anterior al Bloque 2, sin sus colecciones. */
export type StoredDemoState = Omit<DemoState, keyof RecoveryCollections> & Partial<RecoveryCollections>;

// ================= Estado anterior (v3): rol «admin», nombre en un solo campo =================

/** Usuario tal como lo guardaban v2 y v3. */
export interface UserV3 {
  id: string;
  fullName: string;
  email: string;
  dni?: string;
  role: 'participant' | 'admin';
}

export interface DemoStateV3 extends DemoCollections {
  version: 3;
  users: UserV3[];
}

// ================= Estado anterior (v2): un solo curso =================

export type AttemptV2 = Omit<Attempt, 'courseId' | 'examId' | 'scaleMax'>;
export type CertificateV2 = Omit<Certificate, 'courseId' | 'scaleMax' | 'trainingHours'> & {
  trainingHours: number;
};

export interface DemoStateV2 {
  users: UserV3[];
  course: Course;
  exam: ExamConfig;
  questions: Question[];
  enrollments: Enrollment[];
  attempts: AttemptV2[];
  certificates: CertificateV2[];
}

function hasCollections(s: StoredDemoState | DemoStateV3): boolean {
  return [s.users, s.courses, s.modules, s.videos, s.exams, s.questions, s.enrollments, s.attempts, s.certificates].every(
    Array.isArray,
  );
}

/**
 * Estado vigente (v4), con o sin las colecciones del Bloque 2. Si alguna está presente, debe ser una lista
 * (un valor de otro tipo es un dato dañado y se trata como los demás formatos no válidos).
 */
export function isDemoState(p: unknown): p is StoredDemoState {
  const s = p as StoredDemoState;
  return !!s && s.version === 4 && hasCollections(s) && RECOVERY_COLLECTIONS.every((k) => s[k] === undefined || Array.isArray(s[k]));
}

/**
 * Completa las colecciones del Bloque 2 que falten con listas vacías. No modifica el objeto recibido, no toca
 * ninguna otra colección (usuarios, intentos, certificados…) y no guarda nada: es una lectura compatible.
 */
export function normalizeDemoState(s: StoredDemoState): DemoState {
  return {
    ...s,
    companies: s.companies ?? [],
    recoveries: s.recoveries ?? [],
    examStarts: s.examStarts ?? [],
    liveSessions: s.liveSessions ?? [],
  };
}

/** Estado anterior (v3), que se migra a v4 sin modificarlo. */
export function isDemoStateV3(p: unknown): p is DemoStateV3 {
  const s = p as DemoStateV3;
  return !!s && s.version === 3 && hasCollections(s);
}

export function isDemoStateV2(p: unknown): p is DemoStateV2 {
  const s = p as DemoStateV2;
  return (
    !!s &&
    Array.isArray(s.users) &&
    Array.isArray(s.questions) &&
    Array.isArray(s.enrollments) &&
    Array.isArray(s.attempts) &&
    Array.isArray(s.certificates) &&
    !!s.course &&
    typeof s.course.id === 'string' &&
    Array.isArray(s.course.videos) &&
    !!s.exam
  );
}

/** Identificadores derivados del curso migrado. */
export const moduleIdFor = (courseId: string) => `${courseId}-m1`;
export const examIdFor = (courseId: string) => `${courseId}-e1`;

function legacySource(url: string | undefined): VideoSource {
  return url ? { kind: 'url', url } : { kind: 'placeholder' };
}

/**
 * Convierte el estado v2 (un curso) en v3 conservando identificadores y datos.
 * - El curso queda sin portada (null): no se le asigna una en silencio (P9).
 * - La escala de intentos y certificados anteriores no se guardó en v2; se toma la escala vigente
 *   del examen, que es la única conocida (ver PENDIENTES T4).
 */
export function migrateV2(v2: DemoStateV2): DemoStateV3 {
  const { course, exam } = structuredClone(v2);
  const courseId = course.id;
  const moduleId = moduleIdFor(courseId);
  const examId = examIdFor(courseId);

  return {
    version: 3,
    users: structuredClone(v2.users),
    courses: [
      {
        id: courseId,
        name: course.name,
        description: course.description,
        status: course.status,
        trainingHours: course.trainingHours,
        coverImage: null,
        isDemo: true,
      },
    ],
    modules: [{ id: moduleId, courseId, order: 1, title: 'Contenido del curso' }],
    videos: course.videos.map((v) => ({
      id: v.id,
      courseId,
      moduleId,
      order: v.order,
      title: v.title,
      ...(v.description ? { description: v.description } : {}),
      durationSec: v.durationMin * 60,
      published: v.published,
      source: legacySource(v.url),
    })),
    exams: [{ id: examId, courseId, title: 'Examen del curso', active: true, ...exam }],
    questions: structuredClone(v2.questions).map((q) => ({ ...q, examId })),
    enrollments: structuredClone(v2.enrollments),
    attempts: structuredClone(v2.attempts).map((a) => ({ ...a, courseId, examId, scaleMax: exam.scaleMax })),
    certificates: structuredClone(v2.certificates).map((c) => ({ ...c, courseId, scaleMax: exam.scaleMax })),
  };
}

/**
 * Comprueba que la migración no perdió datos. Devuelve la lista de diferencias (vacía si es correcta).
 */
export function verifyMigration(v2: DemoStateV2, v3: DemoStateV3): string[] {
  const problems: string[] = [];
  const check = (label: string, before: number, after: number) => {
    if (before !== after) problems.push(`${label}: ${before} antes, ${after} después.`);
  };
  const courseId = v2.course.id;
  check('Usuarios', v2.users.length, v3.users.filter((u) => v2.users.some((o) => o.id === u.id)).length);
  check('Videos', v2.course.videos.length, v3.videos.filter((v) => v.courseId === courseId).length);
  check('Preguntas', v2.questions.length, v3.questions.filter((q) => q.examId === examIdFor(courseId)).length);
  check('Inscripciones', v2.enrollments.length, v3.enrollments.filter((e) => v2.enrollments.some((o) => o.userId === e.userId && o.courseId === e.courseId)).length);
  check('Intentos', v2.attempts.length, v3.attempts.filter((a) => v2.attempts.some((o) => o.id === a.id)).length);
  check('Certificados', v2.certificates.length, v3.certificates.filter((c) => v2.certificates.some((o) => o.code === c.code)).length);
  if (!v3.courses.some((c) => c.id === courseId)) problems.push(`No se encontró el curso ${courseId}.`);
  return problems;
}

// ================= Migración v3 → v4 (B1.2): rol Instructor y nombres separados =================

/** Nombre original del Instructor de demostración y el nuevo (decisión del 08/11/2026). */
export const DEMO_INSTRUCTOR_ID = 'a1';
export const DEMO_INSTRUCTOR_OLD_NAME = 'Administrador de Prueba';
export const DEMO_INSTRUCTOR_NEW_NAME = 'Instructor de Prueba';

/**
 * Separación conocida de las cuentas de demostración (la misma que la semilla del backend). Solo se aplica si el
 * usuario conserva su nombre original; un nombre personalizado se separa automáticamente y queda para revisión.
 */
const DEMO_NAME_SPLITS: Record<string, { fullName: string; firstNames: string; lastNames: string }> = {
  u1: { fullName: 'Ana Torres Quispe', firstNames: 'Ana', lastNames: 'Torres Quispe' },
  u2: { fullName: 'Luis Mendoza Rojas', firstNames: 'Luis', lastNames: 'Mendoza Rojas' },
  u3: { fullName: 'Carla Vega Soto', firstNames: 'Carla', lastNames: 'Vega Soto' },
  u4: { fullName: 'Pedro Ramos Díaz', firstNames: 'Pedro', lastNames: 'Ramos Díaz' },
  u5: { fullName: 'Rosa Cruz Huamán', firstNames: 'Rosa', lastNames: 'Cruz Huamán' },
  u6: { fullName: 'Jorge Salas León', firstNames: 'Jorge', lastNames: 'Salas León' },
  a1: { fullName: DEMO_INSTRUCTOR_NEW_NAME, firstNames: 'Instructor', lastNames: 'de Prueba' },
};

function migrateUser(old: UserV3): User {
  const role = normalizeRole(old.role) ?? 'participant';
  // a1 solo cambia de nombre si conserva el original de la demostración.
  const fullName =
    old.id === DEMO_INSTRUCTOR_ID && old.fullName === DEMO_INSTRUCTOR_OLD_NAME ? DEMO_INSTRUCTOR_NEW_NAME : old.fullName;
  const known = DEMO_NAME_SPLITS[old.id];
  const names =
    known && known.fullName === fullName
      ? { firstNames: known.firstNames, lastNames: known.lastNames }
      : { ...splitFullName(fullName), nameReview: true as const };
  return { id: old.id, fullName, ...names, email: old.email, ...(old.dni ? { dni: old.dni } : {}), role };
}

/**
 * Convierte v3 en v4 sin modificar el original: copia profunda de todas las colecciones; en los usuarios, el rol
 * «admin» pasa a «instructor» y se agregan nombres y apellidos (conservando `fullName`). Es determinista:
 * repetirla sobre el mismo v3 da el mismo resultado.
 */
export function migrateV3toV4(v3: DemoStateV3): DemoState {
  const { version: _v, users, ...collections } = structuredClone(v3);
  // Etapa 2B, Bloque 2 (R1): v3 no tenía empresas, recuperaciones ni inicios registrados.
  return { version: 4, users: users.map(migrateUser), ...collections, companies: [], recoveries: [], examStarts: [], liveSessions: [] };
}

/** Comprueba que la migración v3 → v4 no perdió ni alteró datos. Devuelve las diferencias (vacía si es correcta). */
export function verifyMigrationV4(v3: DemoStateV3, v4: DemoState): string[] {
  const problems: string[] = [];
  const collections: (keyof DemoCollections)[] = [
    'courses', 'modules', 'videos', 'exams', 'questions', 'enrollments', 'attempts', 'certificates',
  ];
  for (const key of collections) {
    if (JSON.stringify(v3[key]) !== JSON.stringify(v4[key])) problems.push(`La colección «${key}» cambió al migrar.`);
  }
  if (v3.users.length !== v4.users.length) {
    problems.push(`Usuarios: ${v3.users.length} antes, ${v4.users.length} después.`);
    return problems;
  }
  v3.users.forEach((before, i) => {
    const after = v4.users[i];
    const label = `Usuario ${before.id}`;
    if (after.id !== before.id || after.email !== before.email || (after.dni ?? null) !== (before.dni ?? null)) {
      problems.push(`${label}: cambió su identificador, correo o DNI.`);
    }
    const renamed = before.id === DEMO_INSTRUCTOR_ID && before.fullName === DEMO_INSTRUCTOR_OLD_NAME;
    if (after.fullName !== (renamed ? DEMO_INSTRUCTOR_NEW_NAME : before.fullName)) problems.push(`${label}: cambió su nombre.`);
    if (after.role !== normalizeRole(before.role)) problems.push(`${label}: rol «${before.role}» convertido en «${after.role}».`);
    if (!after.firstNames || `${after.firstNames} ${after.lastNames}`.trim().replace(/\s+/g, ' ') !== after.fullName.trim().replace(/\s+/g, ' ')) {
      problems.push(`${label}: los nombres y apellidos no corresponden al nombre completo.`);
    }
  });
  return problems;
}
