import { User } from '../models/user.model';
import { Course, Enrollment } from '../models/course.model';
import { Attempt, Question } from '../models/exam.model';
import { Certificate } from '../models/certificate.model';
import { DEMO_CONFIG } from '../config/demo.config';

// Todos los datos son DE PRUEBA. Correos con dominio reservado .test y DNI ficticios.
export const SEED_USERS: User[] = [
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
  { label: 'Participante · desaprobada, con un intento restante', email: 'carla@ejemplo.test' },
  { label: 'Participante · recién asignado', email: 'pedro@ejemplo.test' },
  { label: 'Participante · lista para rendir examen', email: 'rosa@ejemplo.test' },
  { label: 'Participante · aprobado, certificado pendiente de emisión', email: 'jorge@ejemplo.test' },
  { label: 'Administrador', email: 'admin@ejemplo.test' },
];

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

export const SEED_ATTEMPTS: Attempt[] = [
  { id: 'att1', userId: 'u1', date: '2026-10-12T15:40:00-05:00', durationSec: 1080, score: 80, correctCount: 8, totalQuestions: 10, passed: true },
  { id: 'att2', userId: 'u3', date: '2026-10-10T10:15:00-05:00', durationSec: 1200, score: 50, correctCount: 5, totalQuestions: 10, passed: false },
  { id: 'att3', userId: 'u6', date: '2026-10-17T09:30:00-05:00', durationSec: 900, score: 90, correctCount: 9, totalQuestions: 10, passed: true },
];

// Un solo certificado por aprobación (att1 de Ana).
export const SEED_CERTIFICATES: Certificate[] = [
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
