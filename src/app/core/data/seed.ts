import { Course, Enrollment } from '../models/course.model';
import { Question } from '../models/exam.model';
import { DEMO_CONFIG } from '../config/demo.config';
import { Company } from '../models/user.model';
import { AttemptV2, CertificateV2, DemoState, DemoStateV2, RecoveryCollections, UserV3 } from './demo-state';

// Todos los datos son DE PRUEBA (nunca datos personales reales). Correos con dominio reservado .test y DNI ficticios.
// Se conservan con la forma de v2/v3 (rol «admin», nombre en un campo): la semilla vigente (v4) se obtiene con las
// mismas migraciones que los datos guardados (v2 → v3 → v4), que convierten a1 en «Instructor de Prueba».
export const SEED_USERS: UserV3[] = [
  { id: 'u1', fullName: 'Ana Torres Quispe', email: 'ana@ejemplo.test', dni: '00000001', role: 'participant' },
  { id: 'u2', fullName: 'Luis Mendoza Rojas', email: 'luis@ejemplo.test', dni: '00000002', role: 'participant' },
  { id: 'u3', fullName: 'Carla Vega Soto', email: 'carla@ejemplo.test', dni: '00000003', role: 'participant' },
  { id: 'u4', fullName: 'Pedro Ramos Díaz', email: 'pedro@ejemplo.test', dni: '00000004', role: 'participant' },
  { id: 'u5', fullName: 'Rosa Cruz Huamán', email: 'rosa@ejemplo.test', dni: '00000005', role: 'participant' },
  { id: 'u6', fullName: 'Jorge Salas León', email: 'jorge@ejemplo.test', dni: '00000006', role: 'participant' },
  { id: 'a1', fullName: 'Administrador de Prueba', email: 'admin@ejemplo.test', role: 'admin' },
];

export const DEMO_ACCOUNTS = [
  { label: 'Participante · aprobada, con certificado', email: 'ana@ejemplo.test' },
  { label: 'Participante · en progreso (3 de 6 videos)', email: 'luis@ejemplo.test' },
  { label: 'Participante · desaprobada, sin intentos restantes', email: 'carla@ejemplo.test' },
  { label: 'Participante · recién asignado', email: 'pedro@ejemplo.test' },
  { label: 'Participante · lista para rendir examen', email: 'rosa@ejemplo.test' },
  { label: 'Participante · aprobado, certificado pendiente de emisión', email: 'jorge@ejemplo.test' },
  { label: 'Instructor', email: 'admin@ejemplo.test' }, // correo conservado por compatibilidad (decisión del 08/11/2026)
];

// ================= Curso c1 (estado v2) =================
// Se conserva con la forma del estado v2: la semilla v3 se genera migrándolo (migrateV2),
// el mismo camino que siguen los datos guardados por una versión anterior.

export const SEED_COURSE: Course = {
  id: 'c1',
  name: 'Curso de demostración (nombre provisional)',
  description:
    'Curso de ejemplo para presentar la plataforma. El nombre, el contenido y la descripción reales los definirá la empresa.',
  status: 'publicado',
  trainingHours: 8,
  videos: [
    { id: 'v1', order: 1, title: 'Video 1 · Contenido de demostración', durationMin: 6, published: true },
    { id: 'v2', order: 2, title: 'Video 2 · Contenido de demostración', durationMin: 8, published: true },
    { id: 'v3', order: 3, title: 'Video 3 · Contenido de demostración', durationMin: 7, published: true },
    { id: 'v4', order: 4, title: 'Video 4 · Contenido de demostración', durationMin: 9, published: true },
    { id: 'v5', order: 5, title: 'Video 5 · Contenido de demostración', durationMin: 5, published: true },
    { id: 'v6', order: 6, title: 'Video 6 · Contenido de demostración', durationMin: 10, published: true },
  ],
};

const ALL_VIDEOS = SEED_COURSE.videos.map((v) => v.id);

export const SEED_ENROLLMENTS: Enrollment[] = [
  { userId: 'u1', courseId: 'c1', completedVideoIds: ALL_VIDEOS, startDate: '2026-10-05', status: 'aprobado' },
  { userId: 'u2', courseId: 'c1', completedVideoIds: ['v1', 'v2', 'v3'], startDate: '2026-10-12', status: 'en_progreso' },
  { userId: 'u3', courseId: 'c1', completedVideoIds: ALL_VIDEOS, startDate: '2026-10-06', status: 'desaprobado' },
  { userId: 'u4', courseId: 'c1', completedVideoIds: [], status: 'pendiente' },
  { userId: 'u5', courseId: 'c1', completedVideoIds: ALL_VIDEOS, startDate: '2026-10-14', status: 'listo_examen' },
  { userId: 'u6', courseId: 'c1', completedVideoIds: ALL_VIDEOS, startDate: '2026-10-15', status: 'aprobado' },
];

export const SEED_EXAM = { ...DEMO_CONFIG.exam };

export const SEED_ATTEMPTS: AttemptV2[] = [
  { id: 'att1', userId: 'u1', date: '2026-10-12T15:40:00-05:00', durationSec: 1080, score: 80, correctCount: 8, totalQuestions: 10, passed: true },
  { id: 'att2', userId: 'u3', date: '2026-10-10T10:15:00-05:00', durationSec: 1200, score: 50, correctCount: 5, totalQuestions: 10, passed: false },
  { id: 'att3', userId: 'u6', date: '2026-10-17T09:30:00-05:00', durationSec: 900, score: 90, correctCount: 9, totalQuestions: 10, passed: true },
];

// Un solo certificado por aprobación (att1 de Ana).
export const SEED_CERTIFICATES: CertificateV2[] = [
  {
    id: 'cert1',
    code: 'IMC-DEMO-0001',
    userId: 'u1',
    attemptId: 'att1',
    participantName: 'Ana Torres Quispe',
    participantDni: '00000001',
    courseName: SEED_COURSE.name,
    approvalDate: '2026-10-12',
    issueDate: '2026-10-12',
    score: 80,
    trainingHours: SEED_COURSE.trainingHours,
    entityName: DEMO_CONFIG.entityName,
    status: 'vigente',
  },
];

const TF = [
  { id: 'v', text: 'Verdadero' },
  { id: 'f', text: 'Falso' },
];

// PREGUNTAS DE DEMOSTRACIÓN: no son preguntas oficiales de IMC.
export const SEED_QUESTIONS: Question[] = [
  { id: 'q1', type: 'single', text: '¿Cuál es la capital del Perú?', points: 10, correct: ['b'],
    options: [{ id: 'a', text: 'Cusco' }, { id: 'b', text: 'Lima' }, { id: 'c', text: 'Arequipa' }, { id: 'd', text: 'Piura' }] },
  { id: 'q2', type: 'single', text: '¿Cuántos días tiene una semana?', points: 10, correct: ['c'],
    options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }, { id: 'c', text: '7' }, { id: 'd', text: '8' }] },
  { id: 'q3', type: 'single', text: '¿Qué planeta es conocido como el planeta rojo?', points: 10, correct: ['b'],
    options: [{ id: 'a', text: 'Venus' }, { id: 'b', text: 'Marte' }, { id: 'c', text: 'Júpiter' }, { id: 'd', text: 'Saturno' }] },
  { id: 'q4', type: 'single', text: '¿Cuál de estos programas es un navegador web?', points: 10, correct: ['a'],
    options: [{ id: 'a', text: 'Chrome' }, { id: 'b', text: 'Excel' }, { id: 'c', text: 'Word' }, { id: 'd', text: 'Paint' }] },
  { id: 'q5', type: 'single', text: '¿Cuántos minutos tiene una hora?', points: 10, correct: ['c'],
    options: [{ id: 'a', text: '30' }, { id: 'b', text: '45' }, { id: 'c', text: '60' }, { id: 'd', text: '100' }] },
  { id: 'q6', type: 'multiple', text: 'Selecciona todos los números pares.', points: 10, correct: ['a', 'c', 'e'],
    options: [{ id: 'a', text: '2' }, { id: 'b', text: '3' }, { id: 'c', text: '4' }, { id: 'd', text: '7' }, { id: 'e', text: '8' }] },
  { id: 'q7', type: 'multiple', text: 'Selecciona todas las frutas.', points: 10, correct: ['a', 'c', 'e'],
    options: [{ id: 'a', text: 'Manzana' }, { id: 'b', text: 'Zanahoria' }, { id: 'c', text: 'Plátano' }, { id: 'd', text: 'Papa' }, { id: 'e', text: 'Naranja' }] },
  { id: 'q8', type: 'multiple', text: 'Selecciona los días del fin de semana.', points: 10, correct: ['b', 'd'],
    options: [{ id: 'a', text: 'Lunes' }, { id: 'b', text: 'Sábado' }, { id: 'c', text: 'Miércoles' }, { id: 'd', text: 'Domingo' }] },
  { id: 'q9', type: 'truefalse', text: 'El agua hierve a 100 °C a nivel del mar.', points: 10, correct: ['v'], options: TF },
  { id: 'q10', type: 'truefalse', text: 'El Sol es un planeta.', points: 10, correct: ['f'], options: TF },
];

export const SEED_V2: DemoStateV2 = {
  users: SEED_USERS,
  course: SEED_COURSE,
  exam: SEED_EXAM,
  questions: SEED_QUESTIONS,
  enrollments: SEED_ENROLLMENTS,
  attempts: SEED_ATTEMPTS,
  certificates: SEED_CERTIFICATES,
};

// ================= Cursos de demostración (v3) =================
// NO son cursos oficiales de IMC (PENDIENTES M1). Cada uno tiene un único video real de YouTube,
// solución provisional (M4), por lo que no cumplen RN-03 y quedan en borrador (M3).
// No tienen preguntas: no se inventa contenido de evaluación (D16).

/** Portadas SVG propias y abstractas, sin texto ni logotipos: no son imágenes oficiales de IMC. */
export const SEED_COVERS: Record<string, string> = {
  c1: 'demo/covers/curso-demostracion.svg',
  'c-ia': 'demo/covers/inteligencia-artificial.svg',
  'c-mkt': 'demo/covers/marketing-digital.svg',
};

export const SEED_DEMO_COURSES: Pick<DemoState, 'courses' | 'modules' | 'videos' | 'exams'> = {
  courses: [
    {
      id: 'c-ia',
      name: 'Introducción a la Inteligencia Artificial',
      description:
        'Curso de demostración con un video de referencia de un canal externo. El contenido, las horas y la evaluación oficiales los definirá la empresa.',
      status: 'borrador',
      trainingHours: null,
      coverImage: SEED_COVERS['c-ia'],
      isDemo: true,
    },
    {
      id: 'c-mkt',
      name: 'Fundamentos del Marketing Digital',
      description:
        'Curso de demostración con un video de referencia de un canal externo. El contenido, las horas y la evaluación oficiales los definirá la empresa.',
      status: 'borrador',
      trainingHours: null,
      coverImage: SEED_COVERS['c-mkt'],
      isDemo: true,
    },
  ],
  modules: [
    { id: 'c-ia-m1', courseId: 'c-ia', order: 1, title: 'Contenido del curso' },
    { id: 'c-mkt-m1', courseId: 'c-mkt', order: 1, title: 'Contenido del curso' },
  ],
  videos: [
    {
      id: 'c-ia-v1',
      courseId: 'c-ia',
      moduleId: 'c-ia-m1',
      order: 1,
      title: '¿Qué es y cómo funciona la Inteligencia Artificial?',
      durationSec: 513, // 8:33, verificado en YouTube el 26/10/2026
      published: true,
      source: { kind: 'youtube', videoId: '_tA5cinv0U8' },
      sourceCredit: 'Canal «Derivando» en YouTube',
    },
    {
      id: 'c-mkt-v1',
      courseId: 'c-mkt',
      moduleId: 'c-mkt-m1',
      order: 1,
      title: 'Aprende Marketing paso a paso (método fácil)',
      // 10:03, verificado en YouTube el 26/10/2026. EXCEDE por 3 s el máximo de RN-03 (PENDIENTES V2):
      // se conserva la duración real y la excepción no está aprobada.
      durationSec: 603,
      published: true,
      source: { kind: 'youtube', videoId: 'Ctd6BTuZmjA' },
      sourceCredit: 'Canal «Emprende Aprendiendo» en YouTube',
    },
  ],
  exams: [
    { id: 'c-ia-e1', courseId: 'c-ia', title: 'Examen del curso', active: true, ...DEMO_CONFIG.exam },
    { id: 'c-mkt-e1', courseId: 'c-mkt', title: 'Examen del curso', active: true, ...DEMO_CONFIG.exam },
  ],
};

// ================= Etapa 2B, Bloque 2 (R1): empresas, recuperaciones e inicios =================
// Empresas FICTICIAS (no son clientes reales de IMC), para el filtro por empresa de «Evaluaciones rendidas».

export const SEED_COMPANIES: Company[] = [
  { id: 'emp-a', name: 'Empresa de Demostración A' },
  { id: 'emp-b', name: 'Empresa de Demostración B' },
];

/** Empresa de cada estudiante de la semilla. El Instructor (a1) no pertenece a una empresa. */
export const SEED_USER_COMPANIES: Record<string, string> = {
  u1: 'emp-a',
  u2: 'emp-a',
  u3: 'emp-a',
  u4: 'emp-b',
  u5: 'emp-b',
  u6: 'emp-b',
};

/** Colecciones del Bloque 2 en la semilla: las empresas ficticias y, todavía, ninguna recuperación ni inicio. */
export const SEED_RECOVERY_COLLECTIONS: RecoveryCollections = {
  companies: SEED_COMPANIES,
  recoveries: [],
  examStarts: [],
  liveSessions: [],
};

/**
 * Solo para la semilla (datos de prueba nuevos): agrega las colecciones del Bloque 2 y asigna su empresa a cada
 * estudiante de prueba. No se aplica a datos guardados: allí la normalización solo agrega listas vacías.
 * No modifica el estado recibido.
 */
export function withSeedRecoveryCollections(state: DemoState): DemoState {
  const seed = structuredClone(SEED_RECOVERY_COLLECTIONS);
  const users = state.users.map((u) =>
    SEED_USER_COMPANIES[u.id] && u.role === 'participant' && !u.companyId ? { ...u, companyId: SEED_USER_COMPANIES[u.id] } : u,
  );
  return { ...state, users, ...seed };
}

export const SEED_DEMO_ENROLLMENTS: Enrollment[] = [
  { userId: 'u1', courseId: 'c-ia', completedVideoIds: [], status: 'pendiente' },
  // Vio el único video, pero el curso está en borrador: no pasa a «listo para examen».
  { userId: 'u2', courseId: 'c-mkt', completedVideoIds: ['c-mkt-v1'], startDate: '2026-10-20', status: 'en_progreso' },
  { userId: 'u4', courseId: 'c-ia', completedVideoIds: [], status: 'pendiente' },
  { userId: 'u4', courseId: 'c-mkt', completedVideoIds: [], status: 'pendiente' },
];
