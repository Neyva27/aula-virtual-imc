import { ActivationStatus, WhatsappActivation } from '../models/student.model';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, map, of, reduce, throwError } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { SessionStore } from '../auth/session-store';
import { apiErrorMessage } from '../http/api-errors';
import { Company, User } from '../models/user.model';
import {
  Course,
  CourseContent,
  LiveSession,
  LiveSessionInput,
  LiveSessionStatus,
  CourseInput,
  CourseModuleInput,
  CourseRecord,
  CourseRecordPatch,
  CourseVideoInput,
  Enrollment,
  ParticipantCourse,
  PublicationCheck,
} from '../models/course.model';
import {
  Attempt,
  Exam,
  ExamAvailability,
  ExamConfig,
  ExamQuestion,
  OpenAnswerGrade,
  Question,
  SubmitMode,
} from '../models/exam.model';
import { Certificate } from '../models/certificate.model';
import { ImportHistoryItem, ImportPreview, ImportResult, ImportTemplate } from '../models/certificate-import.model';
import { Recovery, RecoveryInput, RecoveryState, StartedExam } from '../models/recovery.model';
import {
  RegisterStudentInput,
  RegisterStudentResult,
  ActivationSummary,
  Student,
  StudentCompany,
  StudentPage,
  StudentQuery,
} from '../models/student.model';
import { DataRepository, EnrollmentFilter, AttemptFilter, CertificateFilter, StorageStatus } from './data-repository';
import { AdminCompany, CompanyInput, DashboardStats } from '../models/admin.model';

/**
 * La función pertenece a un módulo que todavía no tiene backend. En modo API NUNCA se responde con datos simulados:
 * se informa este error y no se hace ninguna solicitud.
 */
export class FeatureUnavailableError extends Error {
  constructor(readonly feature: string) {
    super(`«${feature}» todavía no está conectado al servidor: módulo en preparación.`);
    this.name = 'FeatureUnavailableError';
  }
}

/** Error de una solicitud a la API, con el mensaje para mostrar (en español, del servidor si es seguro) y su estado. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function unavailable<T>(feature: string): Observable<T> {
  return throwError(() => new FeatureUnavailableError(feature));
}

function toApiRequestError(error: unknown): ApiRequestError {
  return new ApiRequestError(apiErrorMessage(error), error instanceof HttpErrorResponse ? error.status : 0);
}

/** Métodos de la vista heredada de UN solo curso (anterior a E3). Ninguna pantalla actual los usa en modo API. */
const LEGACY = 'Vista heredada de un solo curso';
const STUDENTS = 'Registro de la demostración (en modo API se usa «Registrar participante»)';

const ids = (value: string) => encodeURIComponent(value);
const params = (values: Record<string, string | number | undefined>) =>
  Object.entries(values).reduce((p, [k, v]) => (v === undefined || v === '' ? p : p.set(k, v)), new HttpParams());

/**
 * Datos del MODO API (`npm run start:api`): implementa el contrato `DataRepository` con los endpoints reales de NestJS
 * (MySQL). Nunca recurre a los datos de demostración. Los errores HTTP llegan a la pantalla como `ApiRequestError`.
 *
 * Los métodos que usan los dos perfiles (intentos, certificados, matrículas, examen activo, preguntas) eligen la ruta
 * según el rol de la sesión: el Instructor usa sus rutas (solo sus cursos y estudiantes) y el estudiante `/me/...`
 * (solo su información). El `userId` que reciben algunos métodos es el de la pantalla: el servidor usa el del token.
 *
 * Sin backend todavía: recuperaciones de exámenes (se informan vacías o «no disponibles») y la vista heredada.
 */
@Injectable({ providedIn: 'root' })
export class ApiDataRepository extends DataRepository {
  private readonly http = inject(HttpClient);
  private readonly api = inject(APP_ENVIRONMENT).apiUrl;
  private readonly session = inject(SessionStore);

  private get isStudent(): boolean {
    return this.session.user()?.role === 'participant';
  }

  private request<T>(source: Observable<T>): Observable<T> {
    return source.pipe(catchError((error: unknown) => throwError(() => toApiRequestError(error))));
  }
  private get<T>(path: string, query: Record<string, string | number | undefined> = {}): Observable<T> {
    return this.request(this.http.get<T>(`${this.api}${path}`, { params: params(query) }));
  }
  private post<T>(path: string, body: unknown = null): Observable<T> {
    return this.request(this.http.post<T>(`${this.api}${path}`, body));
  }
  private put<T>(path: string, body: unknown): Observable<T> {
    return this.request(this.http.put<T>(`${this.api}${path}`, body));
  }
  private delete<T>(path: string, query: Record<string, string | undefined> = {}): Observable<T> {
    return this.request(this.http.delete<T>(`${this.api}${path}`, { params: params(query) }));
  }

  // ===================== Estudiantes (registro y consulta) =====================

  /** GET /students: estudiantes que registró el Instructor. Los filtros vacíos no se envían. */
  listStudents(query: StudentQuery = {}): Observable<StudentPage> {
    return this.get<StudentPage>('/students', { q: query.q?.trim() || undefined, companyId: query.companyId, page: query.page, pageSize: query.pageSize });
  }

  /** GET /students/:id. Fuera del alcance del Instructor o inexistente: 404. */
  getStudent(id: string): Observable<Student> {
    return this.get<Student>(`/students/${ids(id)}`);
  }

  /** GET /students/companies: empresas asignadas al Instructor autenticado (activas e inactivas). */
  listInstructorCompanies(): Observable<StudentCompany[]> {
    return this.get<StudentCompany[]>('/students/companies');
  }

  /** POST /students: registra la cuenta (pendiente de activación). No matricula ni genera contraseñas. */
  registerStudent(input: RegisterStudentInput): Observable<RegisterStudentResult> {
    return this.post<RegisterStudentResult>('/students', input);
  }

  /** PATCH /students/:id/contact: actualiza o quita (null) el WhatsApp de un participante propio. */
  updateStudentContact(id: string, whatsapp: string | null): Observable<Student> {
    return this.request(this.http.patch<Student>(`${this.api}/students/${ids(id)}/contact`, { whatsapp }));
  }

  /** POST /students/:id/activation-email: emite un enlace nuevo (anula los anteriores) e intenta enviarlo. */
  resendActivation(id: string): Observable<ActivationSummary> {
    return this.post<{ activation: ActivationSummary }>(`/students/${ids(id)}/activation-email`).pipe(map((r) => r.activation));
  }

  /** Genera un enlace nuevo (anula los anteriores) y devuelve el wa.me preparado. No envía nada. */
  prepareWhatsappActivation(id: string): Observable<WhatsappActivation> {
    return this.post<WhatsappActivation>(`/students/${ids(id)}/activation-whatsapp`);
  }
  markWhatsappOpened(id: string): Observable<ActivationStatus> {
    return this.post<ActivationStatus>(`/students/${ids(id)}/activation-whatsapp/opened`);
  }
  getActivationStatus(id: string): Observable<ActivationStatus> {
    return this.get<ActivationStatus>(`/students/${ids(id)}/activation-status`);
  }

  /** Todos los estudiantes del Instructor (páginas de 100), en el modelo `User` de las pantallas. */
  getUsers(): Observable<User[]> {
    const page = (n: number) => this.listStudents({ page: n, pageSize: 100 });
    return page(1).pipe(
      expand((p) => (p.page * p.pageSize < p.total ? page(p.page + 1) : EMPTY)),
      reduce((all, p) => [...all, ...p.items], [] as Student[]),
      map((list) =>
        list.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          firstNames: s.firstNames,
          lastNames: s.lastNames,
          email: s.email,
          dni: s.dni,
          role: 'participant' as const,
          ...(s.companies[0] ? { companyId: s.companies[0].id, companyNames: s.companies.map((c) => c.name) } : {}),
        })),
      ),
    );
  }

  /** Empresas del Instructor (filtros). */
  listCompanies(): Observable<Company[]> {
    return this.listInstructorCompanies().pipe(map((list) => list.map(({ id, name }) => ({ id, name }))));
  }

  /** El registro real es `registerStudent` (empresas opcionales, sin contraseña). */
  addParticipant(): Observable<User> {
    return unavailable(STUDENTS);
  }

  // ===================== Importación masiva de certificados (permiso IMC_GENERAL_ADMIN) =====================

  certificateImportTemplate(): Observable<ImportTemplate> {
    return this.get<ImportTemplate>('/admin/certificate-imports/template');
  }
  listCertificateImports(): Observable<ImportHistoryItem[]> {
    return this.get<ImportHistoryItem[]>('/admin/certificate-imports');
  }
  /** Analiza el archivo en el servidor. No guarda nada. */
  previewCertificateImport(file: File): Observable<ImportPreview> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.post<ImportPreview>('/admin/certificate-imports/preview', body);
  }
  /** Importa las filas válidas del MISMO archivo analizado (huella `fileHash`), con confirmación expresa. */
  confirmCertificateImport(file: File, fileHash: string): Observable<ImportResult> {
    const body = new FormData();
    body.append('fileHash', fileHash);
    body.append('confirm', 'true');
    body.append('file', file, file.name);
    return this.post<ImportResult>('/admin/certificate-imports/confirm', body);
  }

  // ===================== Administración general (permiso IMC_GENERAL_ADMIN) =====================

  /** Permisos administrativos del Instructor autenticado (no genera denegaciones en la bitácora). */
  myPermissions(): Observable<string[]> {
    return this.get<{ permissions?: string[] }>('/me/permissions').pipe(map((r) => (Array.isArray(r?.permissions) ? r.permissions : [])));
  }
  listAdminCompanies(query: { q?: string; active?: boolean } = {}): Observable<AdminCompany[]> {
    return this.get<AdminCompany[]>('/admin/companies', { q: query.q?.trim() || undefined, active: query.active === undefined ? undefined : String(query.active) });
  }
  createCompany(input: CompanyInput): Observable<AdminCompany> {
    return this.post<AdminCompany>('/admin/companies', input);
  }
  updateCompany(id: string, input: Partial<CompanyInput>): Observable<AdminCompany> {
    return this.request(this.http.patch<AdminCompany>(`${this.api}/admin/companies/${ids(id)}`, input));
  }
  setCompanyActive(id: string, active: boolean): Observable<AdminCompany> {
    return this.post<AdminCompany>(`/admin/companies/${ids(id)}/${active ? 'activate' : 'deactivate'}`);
  }
  /** Indicadores del panel (MySQL). */
  dashboard(): Observable<DashboardStats> {
    return this.get<DashboardStats>('/dashboard');
  }

  // ===================== Cursos, módulos y videos =====================

  getCourses(): Observable<CourseRecord[]> {
    if (this.isStudent) return this.getParticipantCourses().pipe(map((list) => list.map((p) => p.course)));
    return this.get<CourseRecord[]>('/courses');
  }
  getCourseContent(courseId: string): Observable<CourseContent> {
    return this.get<CourseContent>(`/courses/${ids(courseId)}/content`);
  }
  getParticipantCourses(): Observable<ParticipantCourse[]> {
    return this.get<ParticipantCourse[]>('/me/courses');
  }
  getParticipantCourseContent(_userId: string, courseId: string): Observable<CourseContent> {
    return this.get<CourseContent>(`/me/courses/${ids(courseId)}/content`);
  }
  // ----- Sesiones en vivo con Google Meet (20/11/2026) -----
  getCourseLiveSessions(courseId: string): Observable<LiveSession[]> {
    return this.get<LiveSession[]>(`/courses/${ids(courseId)}/live-sessions`);
  }
  getParticipantLiveSessions(_userId: string, courseId: string): Observable<LiveSession[]> {
    return this.get<LiveSession[]>(`/me/courses/${ids(courseId)}/live-sessions`);
  }
  createCourseLiveSession(courseId: string, input: LiveSessionInput): Observable<LiveSession[]> {
    return this.post<LiveSession[]>(`/courses/${ids(courseId)}/live-sessions`, input);
  }
  updateCourseLiveSession(courseId: string, sessionId: string, input: LiveSessionInput): Observable<LiveSession[]> {
    return this.put<LiveSession[]>(`/courses/${ids(courseId)}/live-sessions/${ids(sessionId)}`, input);
  }
  setCourseLiveSessionStatus(courseId: string, sessionId: string, status: LiveSessionStatus): Observable<LiveSession[]> {
    return this.put<LiveSession[]>(`/courses/${ids(courseId)}/live-sessions/${ids(sessionId)}/status`, { status });
  }
  setCourseLiveSessionRecording(courseId: string, sessionId: string, recordingUrl: string | null): Observable<LiveSession[]> {
    return this.put<LiveSession[]>(`/courses/${ids(courseId)}/live-sessions/${ids(sessionId)}/recording`, { recordingUrl });
  }
  createCourse(input: CourseInput): Observable<CourseRecord> {
    return this.post<CourseRecord>('/courses', input);
  }
  updateCourseById(courseId: string, patch: CourseRecordPatch): Observable<CourseRecord> {
    return this.put<CourseRecord>(`/courses/${ids(courseId)}`, patch);
  }
  /**
   * Sube o reemplaza la portada del curso (19/11/2026): multipart con el campo «file» (JPG, PNG o WebP; máximo 2 MB).
   * El servidor guarda el archivo en su almacenamiento y en MySQL solo la ruta; devuelve el curso actualizado.
   */
  uploadCourseCover(courseId: string, file: File): Observable<CourseRecord> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.put<CourseRecord>(`/courses/${ids(courseId)}/cover`, body);
  }
  /** Activa o desactiva el curso (sin matrículas nuevas ni visibilidad para estudiantes mientras esté inactivo). */
  setCourseActive(courseId: string, active: boolean): Observable<CourseRecord> {
    return this.put<CourseRecord>(`/courses/${ids(courseId)}/active`, { active });
  }
  getPublicationCheck(courseId: string): Observable<PublicationCheck> {
    return this.get<PublicationCheck>(`/courses/${ids(courseId)}/publication-check`);
  }
  saveCourseVideo(courseId: string, input: CourseVideoInput): Observable<CourseContent> {
    return this.post<CourseContent>(`/courses/${ids(courseId)}/videos`, input);
  }
  moveCourseVideo(courseId: string, videoId: string, delta: -1 | 1): Observable<CourseContent> {
    return this.post<CourseContent>(`/courses/${ids(courseId)}/videos/${ids(videoId)}/move`, { delta });
  }
  setCourseVideoPublished(courseId: string, videoId: string, published: boolean): Observable<CourseContent> {
    return this.put<CourseContent>(`/courses/${ids(courseId)}/videos/${ids(videoId)}/published`, { published });
  }
  deleteCourseVideo(courseId: string, videoId: string): Observable<CourseContent> {
    return this.delete<CourseContent>(`/courses/${ids(courseId)}/videos/${ids(videoId)}`);
  }
  saveCourseModule(courseId: string, input: CourseModuleInput): Observable<CourseContent> {
    return this.post<CourseContent>(`/courses/${ids(courseId)}/modules`, input);
  }
  moveCourseModule(courseId: string, moduleId: string, delta: -1 | 1): Observable<CourseContent> {
    return this.post<CourseContent>(`/courses/${ids(courseId)}/modules/${ids(moduleId)}/move`, { delta });
  }
  deleteCourseModule(courseId: string, moduleId: string, targetModuleId?: string): Observable<CourseContent> {
    return this.delete<CourseContent>(`/courses/${ids(courseId)}/modules/${ids(moduleId)}`, { targetModuleId });
  }
  assignCourseVideoToModule(courseId: string, videoId: string, moduleId: string): Observable<CourseContent> {
    return this.put<CourseContent>(`/courses/${ids(courseId)}/videos/${ids(videoId)}/module`, { moduleId });
  }

  // ===================== Matrículas y avance =====================

  listEnrollments(filter: EnrollmentFilter = {}): Observable<Enrollment[]> {
    if (this.isStudent) return this.get<Enrollment[]>('/me/enrollments', { courseId: filter.courseId });
    return this.get<Enrollment[]>('/enrollments', { userId: filter.userId, courseId: filter.courseId });
  }
  enrollParticipant(userId: string, courseId: string): Observable<Enrollment> {
    return this.post<Enrollment>('/enrollments', { studentId: userId, courseId });
  }
  unenrollParticipant(userId: string, courseId: string): Observable<Enrollment[]> {
    return this.delete<Enrollment[]>(`/enrollments/${ids(userId)}/${ids(courseId)}`);
  }
  markCourseVideoCompleted(_userId: string, courseId: string, videoId: string): Observable<Enrollment> {
    return this.post<Enrollment>(`/me/courses/${ids(courseId)}/videos/${ids(videoId)}/complete`);
  }

  // ===================== Evaluaciones =====================

  getExams(courseId: string): Observable<Exam[]> {
    return this.get<Exam[]>(`/courses/${ids(courseId)}/exams`);
  }
  getActiveExam(courseId: string): Observable<Exam | null> {
    if (this.isStudent) return this.get<Exam | null>(`/me/courses/${ids(courseId)}/exam`);
    return this.get<Exam | null>(`/courses/${ids(courseId)}/exams/active`);
  }
  getStudentExam(_userId: string, courseId: string): Observable<Exam | null> {
    return this.get<Exam | null>(`/me/courses/${ids(courseId)}/exam`);
  }
  /** Para el estudiante, sin respuestas correctas ni criterios (lo filtra el servidor). */
  getExamQuestions(examId: string): Observable<ExamQuestion[]> {
    if (this.isStudent) return this.get<ExamQuestion[]>(`/me/exams/${ids(examId)}/questions`);
    return this.get<ExamQuestion[]>(`/exams/${ids(examId)}/questions`);
  }
  getExamAvailability(_userId: string, courseId: string): Observable<ExamAvailability> {
    return this.get<ExamAvailability>(`/me/courses/${ids(courseId)}/exam/availability`);
  }
  createCourseExam(courseId: string): Observable<Exam> {
    return this.post<Exam>(`/courses/${ids(courseId)}/exams`);
  }
  updateExamConfigById(examId: string, config: ExamConfig): Observable<Exam> {
    return this.put<Exam>(`/exams/${ids(examId)}/config`, config);
  }
  saveExamQuestion(examId: string, question: Question): Observable<ExamQuestion[]> {
    return this.post<ExamQuestion[]>(`/exams/${ids(examId)}/questions`, question);
  }
  deleteExamQuestion(examId: string, questionId: string): Observable<ExamQuestion[]> {
    return this.delete<ExamQuestion[]>(`/exams/${ids(examId)}/questions/${ids(questionId)}`);
  }
  startExam(_userId: string, courseId: string): Observable<StartedExam> {
    return this.post<StartedExam>(`/me/courses/${ids(courseId)}/exam/start`);
  }
  saveExamAnswers(_userId: string, courseId: string, answers: Record<string, string[]>): Observable<Record<string, string[]>> {
    return this.put<Record<string, string[]>>(`/me/courses/${ids(courseId)}/exam/answers`, { answers });
  }
  submitExamAttempt(_userId: string, examId: string, answers: Record<string, string[]>, durationSec: number, mode: SubmitMode = 'voluntaria'): Observable<Attempt> {
    return this.post<Attempt>(`/me/exams/${ids(examId)}/submit`, { answers, durationSec: Math.round(durationSec), mode });
  }

  // ===================== Resultados y certificados =====================

  listAttempts(filter: AttemptFilter = {}): Observable<Attempt[]> {
    if (this.isStudent) return this.get<Attempt[]>('/me/attempts', { courseId: filter.courseId, examId: filter.examId });
    return this.get<Attempt[]>('/attempts', { userId: filter.userId, courseId: filter.courseId, examId: filter.examId });
  }
  gradeOpenAnswers(attemptId: string, grades: OpenAnswerGrade[]): Observable<Attempt> {
    return this.post<Attempt>(`/attempts/${ids(attemptId)}/grade`, { grades });
  }
  listCertificates(filter: CertificateFilter = {}): Observable<Certificate[]> {
    if (this.isStudent) return this.get<Certificate[]>('/me/certificates', { courseId: filter.courseId });
    // 20/11/2026: los filtros se aplican en el servidor (dentro del alcance del Instructor). Vacíos = sin filtro.
    const text = (v?: string) => v?.trim() || undefined;
    return this.get<Certificate[]>('/certificates', {
      userId: filter.userId,
      courseId: filter.courseId,
      student: text(filter.student),
      code: text(filter.code),
      companyId: text(filter.companyId),
      from: text(filter.from),
      to: text(filter.to),
    });
  }
  getCertificates(userId?: string): Observable<Certificate[]> {
    return this.listCertificates({ userId });
  }
  /** Verificación pública: sin DNI ni identificadores internos. Código inexistente → null. */
  findCertificateByCode(code: string): Observable<Certificate | null> {
    return this.http.get<Certificate>(`${this.api}/public/certificates/${ids(code.trim())}`).pipe(
      catchError((error: unknown) => (error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => toApiRequestError(error)))),
    );
  }
  findCertificatesByDni(dni: string): Observable<Certificate[]> {
    return this.get<Certificate[]>(`/public/certificates/dni/${ids(dni.trim())}`);
  }

  // ===================== Recuperaciones de examen (21/11/2026) =====================
  // Instructor: rutas de sus cursos. Estudiante: solo su propia situación (/me/...).

  listRecoveries(filter: { userId?: string; courseId?: string } = {}): Observable<Recovery[]> {
    if (this.isStudent) return of([]);
    return this.get<Recovery[]>('/recoveries', { courseId: filter.courseId, userId: filter.userId });
  }
  listRecoveryStates(filter: { userId?: string; courseId?: string } = {}): Observable<RecoveryState[]> {
    if (this.isStudent) return of([]);
    return this.get<RecoveryState[]>('/recovery-states', { courseId: filter.courseId, userId: filter.userId });
  }
  getRecoveryStatus(userId: string, courseId: string): Observable<RecoveryState> {
    if (this.isStudent) return this.get<RecoveryState>(`/me/courses/${ids(courseId)}/recovery`);
    return this.get<RecoveryState[]>('/recovery-states', { courseId, userId }).pipe(
      map((list) => list[0] ?? { userId, courseId, status: null, reason: 'El estudiante no está inscrito en este curso.', recovery: null }),
    );
  }
  /** El servidor toma al Instructor del token: `_instructorId` no se envía. */
  authorizeRecovery(_instructorId: string, input: RecoveryInput): Observable<Recovery> {
    return this.post<Recovery>('/recoveries', input);
  }
  cancelRecovery(_instructorId: string, recoveryId: string): Observable<Recovery> {
    return this.put<Recovery>(`/recoveries/${ids(recoveryId)}/cancel`, {});
  }

  // ===================== Vista heredada de un solo curso (sin uso en modo API) =====================

  getCourse(): Observable<Course> {
    return unavailable(LEGACY);
  }
  getEnrollment(): Observable<Enrollment | null> {
    return unavailable(LEGACY);
  }
  getEnrollments(): Observable<Enrollment[]> {
    return unavailable(LEGACY);
  }
  getExamConfig(): Observable<ExamConfig> {
    return unavailable(LEGACY);
  }
  getQuestions(): Observable<Question[]> {
    return unavailable(LEGACY);
  }
  getAttempts(): Observable<Attempt[]> {
    return unavailable(LEGACY);
  }
  markVideoCompleted(): Observable<Enrollment> {
    return unavailable(LEGACY);
  }
  submitAttempt(): Observable<Attempt> {
    return unavailable(LEGACY);
  }
  updateCourse(): Observable<Course> {
    return unavailable(LEGACY);
  }
  saveVideo(): Observable<Course> {
    return unavailable(LEGACY);
  }
  moveVideo(): Observable<Course> {
    return unavailable(LEGACY);
  }
  setVideoPublished(): Observable<Course> {
    return unavailable(LEGACY);
  }
  deleteVideo(): Observable<Course> {
    return unavailable(LEGACY);
  }
  updateExamConfig(): Observable<ExamConfig> {
    return unavailable(LEGACY);
  }
  saveQuestion(): Observable<Question[]> {
    return unavailable(LEGACY);
  }
  deleteQuestion(): Observable<Question[]> {
    return unavailable(LEGACY);
  }

  // ----- Solo demostración: en modo API no hay datos guardados en el navegador -----

  resetDemo(): void {
    throw new FeatureUnavailableError('Restablecer datos de demostración');
  }
  getStorageStatus(): StorageStatus {
    return { source: 'api', warning: '', migrationProblems: [], legacyStatePresent: false };
  }
  removeLegacyState(): boolean {
    return false;
  }
}
