import { Observable } from 'rxjs';
import { Company, User } from '../models/user.model';
import {
  Course,
  CourseContent,
  LiveSession,
  LiveSessionInput,
  LiveSessionStatus,
  CourseInput,
  CourseModuleInput,
  CoursePatch,
  CourseRecord,
  CourseRecordPatch,
  CourseVideoInput,
  Enrollment,
  ParticipantCourse,
  ParticipantInput,
  PublicationCheck,
  VideoInput,
} from '../models/course.model';
import { Attempt, Exam, ExamAvailability, ExamConfig, ExamQuestion, OpenAnswerGrade, Question, SubmitMode } from '../models/exam.model';
import { Certificate, CertificateSearch } from '../models/certificate.model';
import { Recovery, RecoveryInput, RecoveryState, StartedExam } from '../models/recovery.model';

export interface EnrollmentFilter {
  userId?: string;
  courseId?: string;
}

/** Certificados (20/11/2026): además del estudiante y el curso, los filtros de «Certificados emitidos». */
export interface CertificateFilter extends EnrollmentFilter, CertificateSearch {}

export interface AttemptFilter extends EnrollmentFilter {
  examId?: string;
}

/** Origen de los datos de la demostración (solo para la versión simulada). En modo API: 'api', sin avisos. */
export interface StorageStatus {
  source: 'seed' | 'v4' | 'migrated-v3' | 'migrated-v2' | 'api';
  /** Aviso para mostrar en la interfaz; cadena vacía si no hay nada que avisar. */
  warning: string;
  /** Diferencias encontradas al verificar la migración. */
  migrationProblems: string[];
  /** El estado anterior (v2) sigue guardado en este navegador. */
  legacyStatePresent: boolean;
}

/**
 * Contrato de datos de la aplicación. Hoy lo implementa MockDataRepository;
 * luego se sustituye por una implementación con HttpClient sin tocar las pantallas.
 *
 * Los métodos "heredados" trabajan sobre el curso principal (DEMO_CONFIG.legacyCourseId), que es el
 * que muestran las pantallas actuales. Los métodos de varios cursos los usarán E3 y E5.
 */
export abstract class DataRepository {
  // ----- Lecturas (heredadas: curso principal) -----
  abstract getUsers(): Observable<User[]>;
  /** R7: empresas de los estudiantes (filtro de «Evaluaciones rendidas»). Solo lectura. */
  abstract listCompanies(): Observable<Company[]>;
  abstract getCourse(): Observable<Course>;
  abstract getEnrollment(userId: string): Observable<Enrollment | null>;
  abstract getEnrollments(): Observable<Enrollment[]>;
  abstract getExamConfig(): Observable<ExamConfig>;
  abstract getQuestions(): Observable<Question[]>;
  abstract getAttempts(userId?: string): Observable<Attempt[]>;
  /** Certificados de todos los cursos (cada uno conserva el nombre de su curso). */
  abstract getCertificates(userId?: string): Observable<Certificate[]>;
  abstract findCertificateByCode(code: string): Observable<Certificate | null>;
  abstract findCertificatesByDni(dni: string): Observable<Certificate[]>;

  // ----- Lecturas (varios cursos) -----
  abstract getCourses(): Observable<CourseRecord[]>;
  /** Contenido completo del curso, incluidos los videos no publicados (administración). */
  abstract getCourseContent(courseId: string): Observable<CourseContent>;
  /** Cursos asignados al alumno, con su progreso. Los borradores solo aparecen en modo demostración. */
  abstract getParticipantCourses(userId: string): Observable<ParticipantCourse[]>;
  /** Contenido publicado de un curso, solo si el alumno lo tiene asignado. */
  abstract getParticipantCourseContent(userId: string, courseId: string): Observable<CourseContent>;
  /** Sesiones en vivo (20/11/2026). Instructor: las de su curso. Alumno: las de un curso asignado (también canceladas). */
  abstract getCourseLiveSessions(courseId: string): Observable<LiveSession[]>;
  abstract getParticipantLiveSessions(userId: string, courseId: string): Observable<LiveSession[]>;
  abstract createCourseLiveSession(courseId: string, input: LiveSessionInput): Observable<LiveSession[]>;
  abstract updateCourseLiveSession(courseId: string, sessionId: string, input: LiveSessionInput): Observable<LiveSession[]>;
  abstract setCourseLiveSessionStatus(courseId: string, sessionId: string, status: LiveSessionStatus): Observable<LiveSession[]>;
  /** Grabación de una clase ya realizada (enlace https); null la quita. */
  abstract setCourseLiveSessionRecording(courseId: string, sessionId: string, recordingUrl: string | null): Observable<LiveSession[]>;
  abstract listEnrollments(filter?: EnrollmentFilter): Observable<Enrollment[]>;
  abstract getExams(courseId: string): Observable<Exam[]>;
  abstract getActiveExam(courseId: string): Observable<Exam | null>;
  abstract getExamQuestions(examId: string): Observable<ExamQuestion[]>;
  abstract getExamAvailability(userId: string, courseId: string): Observable<ExamAvailability>;
  abstract listAttempts(filter?: AttemptFilter): Observable<Attempt[]>;
  abstract listCertificates(filter?: CertificateFilter): Observable<Certificate[]>;

  /**
   * Etapa 2B, Bloque 2 (R2): examen que le corresponde rendir al estudiante en el curso. Por ahora siempre el
   * examen regular activo (la selección de recuperaciones llega en R3). null si el curso no tiene examen regular.
   */
  abstract getStudentExam(userId: string, courseId: string): Observable<Exam | null>;

  // ----- Participante (simulado) -----
  /**
   * Etapa 2B, Bloque 2 (R2): registra el inicio real del examen regular (con las mismas validaciones que para
   * rendirlo) o, si ya estaba iniciado y sin entregar (recarga, otra pestaña), devuelve ese mismo inicio.
   * No crea ningún intento.
   */
  abstract startExam(userId: string, courseId: string): Observable<StartedExam>;
  /**
   * Corrección de R3: guarda en el repositorio las respuestas indicadas (por pregunta, sin borrar las demás) del
   * examen iniciado del estudiante en el curso, mientras su tiempo no haya terminado. Devuelve todas las guardadas.
   */
  abstract saveExamAnswers(userId: string, courseId: string, answers: Record<string, string[]>): Observable<Record<string, string[]>>;

  // ----- Recuperaciones (Etapa 2B, Bloque 2, R3) -----
  /** Solo el Instructor. Valida a quién (solo desaprobados), una sola oportunidad y la ventana; siempre el examen original. No crea intentos. */
  abstract authorizeRecovery(instructorId: string, input: RecoveryInput): Observable<Recovery>;
  /** Solo el Instructor y solo antes de que el estudiante inicie: no consume la oportunidad. */
  abstract cancelRecovery(instructorId: string, recoveryId: string): Observable<Recovery>;
  abstract listRecoveries(filter?: { userId?: string; courseId?: string }): Observable<Recovery[]>;
  /** Situación de recuperación del estudiante en el curso, calculada al consultar. */
  abstract getRecoveryStatus(userId: string, courseId: string): Observable<RecoveryState>;
  /** R4: situación de recuperación de cada inscripción (para la vista del Instructor). */
  abstract listRecoveryStates(filter?: { userId?: string; courseId?: string }): Observable<RecoveryState[]>;
  abstract markVideoCompleted(userId: string, videoId: string): Observable<Enrollment>;
  abstract markCourseVideoCompleted(userId: string, courseId: string, videoId: string): Observable<Enrollment>;
  /**
   * Etapa 2B (D3, P4): `mode` 'voluntaria' (por defecto) exige todas las preguntas completas; 'tiempo' (tiempo agotado)
   * envía solo lo registrado. Los intentos nuevos se califican con la regla proporcional.
   */
  abstract submitAttempt(
    userId: string,
    answers: Record<string, string[]>,
    durationSec: number,
    mode?: SubmitMode,
  ): Observable<Attempt>;
  abstract submitExamAttempt(
    userId: string,
    examId: string,
    answers: Record<string, string[]>,
    durationSec: number,
    mode?: SubmitMode,
  ): Observable<Attempt>;

  // ----- Administración (simulado) -----
  /** Sin `courseIds`, inscribe en el curso principal (comportamiento actual). */
  abstract addParticipant(input: ParticipantInput, courseIds?: string[]): Observable<User>;
  abstract enrollParticipant(userId: string, courseId: string): Observable<Enrollment>;
  /** Ampliación respecto de RN-02 solicitada el 23/10, pendiente de formalizar (PENDIENTES S1, S2). */
  abstract createCourse(input: CourseInput): Observable<CourseRecord>;
  abstract updateCourseById(courseId: string, patch: CourseRecordPatch): Observable<CourseRecord>;
  abstract updateCourse(patch: CoursePatch): Observable<Course>;
  abstract saveVideo(input: VideoInput): Observable<Course>;
  abstract moveVideo(videoId: string, delta: -1 | 1): Observable<Course>;
  abstract setVideoPublished(videoId: string, published: boolean): Observable<Course>;
  abstract deleteVideo(videoId: string): Observable<Course>;
  abstract updateExamConfig(config: ExamConfig): Observable<ExamConfig>;
  abstract saveQuestion(question: Question): Observable<Question[]>;
  abstract deleteQuestion(questionId: string): Observable<Question[]>;

  // ----- Administración por curso (E5.1) -----
  /** Retira un curso asignado solo si el participante no tiene avance, intentos ni certificados en él. */
  abstract unenrollParticipant(userId: string, courseId: string): Observable<Enrollment[]>;
  abstract getPublicationCheck(courseId: string): Observable<PublicationCheck>;
  abstract saveCourseVideo(courseId: string, input: CourseVideoInput): Observable<CourseContent>;
  abstract moveCourseVideo(courseId: string, videoId: string, delta: -1 | 1): Observable<CourseContent>;
  abstract setCourseVideoPublished(courseId: string, videoId: string, published: boolean): Observable<CourseContent>;
  abstract deleteCourseVideo(courseId: string, videoId: string): Observable<CourseContent>;

  // ----- Módulos del curso (M2): no cambian la cantidad de videos ni su publicación (RN-03) -----
  /** Crea (sin `id`) o edita el título y la descripción de un módulo. */
  abstract saveCourseModule(courseId: string, input: CourseModuleInput): Observable<CourseContent>;
  abstract moveCourseModule(courseId: string, moduleId: string, delta: -1 | 1): Observable<CourseContent>;
  /**
   * Elimina un módulo. Nunca borra videos: si tiene videos, se mueven antes a `targetModuleId` (obligatorio en ese caso).
   * El último módulo del curso no se puede eliminar.
   */
  abstract deleteCourseModule(courseId: string, moduleId: string, targetModuleId?: string): Observable<CourseContent>;
  /** Mueve un video existente del curso al final de otro módulo del mismo curso. */
  abstract assignCourseVideoToModule(courseId: string, videoId: string, moduleId: string): Observable<CourseContent>;
  /** Crea la evaluación de un curso sin evaluación activa (un examen activo por curso, D1). */
  abstract createCourseExam(courseId: string): Observable<Exam>;
  abstract updateExamConfigById(examId: string, config: ExamConfig): Observable<Exam>;
  abstract saveExamQuestion(examId: string, question: Question): Observable<ExamQuestion[]>;
  abstract deleteExamQuestion(examId: string, questionId: string): Observable<ExamQuestion[]>;
  /**
   * M5: calificación manual de las preguntas abiertas de un intento «En revisión». Debe incluir todas sus preguntas
   * abiertas; al completarse se calcula la nota, se fija aprobado o desaprobado y, si aprobó, se emite el certificado.
   * No modifica la evaluación (RN-15) y una calificación completada no se cambia.
   */
  abstract gradeOpenAnswers(attemptId: string, grades: OpenAnswerGrade[]): Observable<Attempt>;

  // ----- Solo demostración -----
  /** Restablece los datos de prueba. No borra el estado anterior (v2). */
  abstract resetDemo(): void;
  abstract getStorageStatus(): StorageStatus;
  /** Elimina el estado anterior (v2) solo si el estado actual (v3) está guardado y es válido. */
  abstract removeLegacyState(): boolean;
}
