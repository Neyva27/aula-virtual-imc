import { Component, computed, inject, input, signal } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { Company, User } from '../../core/models/user.model';
import { AdminAttemptDetail } from './admin-attempt-detail';
import { AdminRecoveries } from './admin-recoveries';
import { CourseRecord, Enrollment } from '../../core/models/course.model';
import { Attempt, ExamQuestion, MAX_ATTEMPTS, attemptPoints, courseResult, isPendingReview } from '../../core/models/exam.model';
import { Certificate } from '../../core/models/certificate.model';
import { buildXlsx, downloadFile } from '../../core/utils/xlsx-export';
import { CSV_MIME, buildCsv } from '../../core/utils/csv-export';
import { buildPdfReport } from '../../core/utils/pdf-report';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';

/** R8: columnas del reporte, exactamente estas y en este orden (sin columna «Recuperación»). */
export const EXPORT_HEADERS = ['Estudiante', 'DNI', 'Empresa', 'Curso', 'Nota final', 'Estado', 'Certificación'] as const;
const EXPORT_WIDTHS = [30, 11, 28, 34, 11, 13, 20];
import { RECOVERY_STATUS_LABELS, RecoveryState } from '../../core/models/recovery.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { AttemptDurationPipe } from '../../shared/pipes/attempt-duration.pipe';
import { AdminCourseSelect } from './admin-course-select';
import { enrollmentPercent, errMsg, publishedVideoIds } from './admin-utils';

@Component({
  selector: 'app-admin-results',
  imports: [DatePipe, StatusBadge, AdminCourseSelect, AttemptDurationPipe, AdminAttemptDetail, AdminRecoveries],
  template: `
    <div class="stack">
      <header class="page-head">
        <h1>Evaluaciones rendidas</h1>
        <p class="muted">Evaluaciones regulares y de recuperación: notas, respuestas, calificaciones pendientes y recuperaciones.</p>
      </header>

      @if (courses().length) {
        <app-admin-course-select [courses]="courses()" [selected]="courseId()" allLabel="Todos los cursos" (selectedChange)="selectCourse($event)" />
      }
      @if (!loading()) {
        <!-- R7: filtros por estudiante y empresa (con los datos disponibles; sin empresa = «Sin empresa»). -->
        <div class="grid grid-2 filters" data-filters>
          <div class="field">
            <label for="filter-student">Estudiante</label>
            <select id="filter-student" class="input" (change)="selectFilter('estudiante', $any($event.target).value)">
              <option value="" [selected]="!studentId()">Todos los estudiantes</option>
              @for (u of students(); track u.id) {
                <option [value]="u.id" [selected]="studentId() === u.id">{{ u.fullName }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="filter-company">Empresa</label>
            <select id="filter-company" class="input" (change)="selectFilter('empresa', $any($event.target).value)">
              <option value="" [selected]="!companyFilter()">Todas las empresas</option>
              @for (c of companies(); track c.id) {
                <option [value]="c.id" [selected]="companyFilter() === c.id">{{ c.name }}</option>
              }
              <option value="sin-empresa" [selected]="companyFilter() === 'sin-empresa'">Sin empresa</option>
            </select>
          </div>
          <div class="field">
            <label for="filter-from">Rendidas desde</label>
            <input id="filter-from" class="input" type="date" [value]="dateFrom()" (change)="dateFrom.set($any($event.target).value)" />
          </div>
          <div class="field">
            <label for="filter-to">Rendidas hasta</label>
            <input id="filter-to" class="input" type="date" [value]="dateTo()" (change)="dateTo.set($any($event.target).value)" />
          </div>
        </div>
      }

      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else {
        <section class="stack">
          <h2>Estado por inscripción</h2>
          <!-- R8: exportación a Excel de los resultados definitivos, con los mismos filtros de la pantalla. -->
          <div class="card stack export" data-export>
            <div class="row between">
              <p class="small" data-export-summary>
                {{ exportPlan().rows.length === 0 ? 'No hay resultados definitivos para exportar con estos filtros.' :
                   exportPlan().rows.length === 1 ? 'Se exportará 1 resultado definitivo.' : 'Se exportarán ' + exportPlan().rows.length + ' resultados definitivos.' }}
              </p>
              <div class="row">
                <button type="button" class="btn btn-secondary" [disabled]="exportPlan().rows.length === 0" (click)="exportExcel()">Exportar a Excel</button>
                <button type="button" class="btn btn-secondary" [disabled]="exportPlan().rows.length === 0" (click)="exportCsv()">Exportar a CSV</button>
                <button type="button" class="btn btn-secondary" [disabled]="exportPlan().rows.length === 0" (click)="exportPdf()">Exportar a PDF</button>
              </div>
            </div>
            @if (exportPlan().pending + exportPlan().notTaken + exportPlan().inRecovery > 0) {
              <ul class="small muted excluded" data-export-excluded>
                @if (exportPlan().pending) { <li data-excluded="pendientes">{{ exportPlan().pending }} {{ exportPlan().pending === 1 ? 'excluido' : 'excluidos' }}: pendiente de calificación.</li> }
                @if (exportPlan().notTaken) { <li data-excluded="sin-rendir">{{ exportPlan().notTaken }} {{ exportPlan().notTaken === 1 ? 'excluido' : 'excluidos' }}: todavía no rindió.</li> }
                @if (exportPlan().inRecovery) { <li data-excluded="recuperacion">{{ exportPlan().inRecovery }} {{ exportPlan().inRecovery === 1 ? 'excluido' : 'excluidos' }}: recuperación en curso.</li> }
              </ul>
            }
            @if (exportMessage()) { <p class="small" role="status" data-export-message>{{ exportMessage() }}</p> }
          </div>
          @if (rows().length === 0) {
            <p class="card muted">No hay participantes inscritos en este curso.</p>
          } @else {
            <div class="table-wrap table-cards">
              <table>
                <caption class="sr-only">Estado de cada participante en cada curso</caption>
                <thead>
                  <tr>
                    <th scope="col">Participante</th><th scope="col">Empresa</th><th scope="col">Curso</th><th scope="col">Avance</th>
                    <th scope="col">Estado</th><th scope="col">Intentos</th><th scope="col">Nota regular</th>
                    <th scope="col">Recuperación</th><th scope="col">Nota final</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rows(); track r.key) {
                    <tr [attr.data-row]="r.key">
                      <td data-label="Participante">{{ r.user.fullName }}</td>
                      <td data-label="Empresa">{{ companyName(r.user) }}</td>
                      <td data-label="Curso">{{ r.courseName }}</td>
                      <td data-label="Avance">{{ r.percent }}%</td>
                      <td data-label="Estado"><app-status-badge [status]="r.enrollment.status" /></td>
                      <td data-label="Intentos">{{ r.attempts }} de {{ maxAttempts }}@if (r.result.recovery) { <span class="small muted">+ recuperación</span> }</td>
                      <!-- R4: la nota regular se conserva; la de la recuperación la reemplaza como nota final, aunque sea menor. -->
                      <td data-label="Nota regular">
                        @if (!r.result.regular) { — } @else if (pending(r.result.regular)) { <span class="badge badge--warning">En revisión</span> } @else { {{ r.result.regular.score }} / {{ r.result.regular.scaleMax }} }
                      </td>
                      <td data-label="Recuperación">
                        @if (r.result.recovery; as rec) {
                          @if (pending(rec)) { <span class="badge badge--warning">En revisión</span> } @else { {{ rec.score }} / {{ rec.scaleMax }} }
                        } @else { {{ recoveryLabel(r.recovery) }} }
                      </td>
                      <td data-label="Nota final">
                        @if (r.result.final; as f) { <strong>{{ f.score }} / {{ f.scaleMax }}</strong> } @else if (r.result.condition === 'en_revision') { Pendiente } @else { — }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <section class="stack">
          <h2>Historial de intentos</h2>
          <!-- R7: evaluaciones con preguntas abiertas que esperan la calificación del Instructor. -->
          <p class="small" data-pending-count>
            {{ pendingCount() === 0 ? 'No hay evaluaciones pendientes de calificación.' : pendingCount() === 1 ? 'Hay 1 evaluación pendiente de calificación.' : 'Hay ' + pendingCount() + ' evaluaciones pendientes de calificación.' }}
          </p>
          @if (history().length === 0) {
            <p class="card muted">{{ courseId() ? 'No hay intentos registrados en este curso.' : 'Aún no hay intentos registrados.' }}</p>
          } @else {
            <div class="table-wrap table-cards">
              <table>
                <caption class="sr-only">Historial de intentos</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th><th scope="col">Participante</th><th scope="col">Curso</th><th scope="col">Nota</th>
                    <th scope="col">Puntos obtenidos</th><th scope="col">Duración</th><th scope="col">Resultado</th>
                    <th scope="col"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of history(); track a.id) {
                    <tr [attr.data-attempt]="a.id">
                      <td data-label="Fecha">{{ a.date | date: 'dd/MM/yyyy HH:mm' }}</td>
                      <td data-label="Participante">{{ nameOf(a.userId) }}</td>
                      <td data-label="Curso">
                        {{ courseName(a.courseId) }}
                        @if (!isEnrolled(a.userId, a.courseId)) { <span class="badge badge--neutral">Ya no asignado</span> }
                      </td>
                      <!-- Escala guardada en el intento, no la configuración actual del examen. -->
                      <td data-label="Nota">
                        {{ pending(a) ? 'Pendiente' : a.score + ' / ' + a.scaleMax }}
                        <!-- R4: tipo de intento; la nota regular se conserva, pero la reemplaza la recuperación. -->
                        @if (a.kind === 'recuperacion') { <span class="badge badge--info" data-kind="recuperacion">Recuperación</span> }
                        @else if (replaced(a)) { <span class="small muted" data-kind="reemplazada">Reemplazada por la recuperación</span> }
                      </td>
                      <!-- Etapa 2B (P3): puntos guardados al rendir; los intentos anteriores no tienen detalle y no se recalculan. -->
                      <td data-label="Puntos obtenidos">
                        @if (pending(a)) {
                          Pendiente
                        } @else if (points(a); as p) {
                          {{ decimal(p.earned) }} de {{ decimal(p.max) }}
                        } @else {
                          <span class="muted">No disponible <span class="small">(intento anterior a la calificación proporcional)</span></span>
                        }
                      </td>
                      <td data-label="Duración">{{ a.durationSec | attemptDuration }}</td>
                      <td data-label="Resultado">
                        @if (pending(a)) {
                          <!-- M5: con preguntas abiertas sin calificar no hay aprobado ni desaprobado. -->
                          <span class="badge badge--warning">En revisión</span>
                        } @else {
                          <span class="badge" [class]="a.passed ? 'badge--success' : 'badge--danger'">
                            {{ a.passed ? 'Aprobado' : 'Desaprobado' }}
                          </span>
                        }
                      </td>
                      <td class="actions">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="openDetail(a)"
                          [attr.aria-label]="'Ver el detalle de la evaluación de ' + nameOf(a.userId)">Ver detalle</button>
                        @if (pending(a)) {
                          <button type="button" class="btn btn-secondary btn-sm" (click)="startGrading(a)"
                            [attr.aria-label]="'Calificar el intento de ' + nameOf(a.userId)">Calificar</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
        @if (grading(); as g) {
          <section class="card stack grading" aria-labelledby="grading-title" data-grading>
            <h2 id="grading-title">Calificar respuestas abiertas</h2>
            <p class="small muted">
              {{ nameOf(g.attempt.userId) }} · {{ courseName(g.attempt.courseId) }} · intento del {{ g.attempt.date | date: 'dd/MM/yyyy HH:mm' }}.
              Las preguntas de selección ya se calificaron automáticamente; asigna el puntaje de cada respuesta abierta.
            </p>
            @if (gradingError()) { <p class="alert alert-danger" role="alert">{{ gradingError() }}</p> }
            @if (g.loading) {
              <p class="muted" role="status">Cargando las respuestas…</p>
            } @else {
              @for (q of g.questions; track q.id; let i = $index) {
                <article class="answer stack" [attr.data-question]="q.id">
                  <h3>{{ i + 1 }}. {{ q.text }}</h3>
                  @if (q.rubric) { <p class="small rubric"><strong>Criterio:</strong> {{ q.rubric }}</p> }
                  <div class="reply">
                    <span class="small muted">Respuesta del alumno</span>
                    @if (answerOf(g.attempt, q.id); as text) {
                      <p class="reply__text">{{ text }}</p>
                    } @else {
                      <p class="muted">Sin respuesta.</p>
                    }
                  </div>
                  <div class="field score">
                    <label [for]="'score-' + q.id">Puntaje (de 0 a {{ q.points }})</label>
                    <input class="input" type="number" min="0" [max]="q.points" step="0.5" inputmode="decimal" [id]="'score-' + q.id"
                      [value]="g.scores[q.id] ?? ''" (input)="setScore(q.id, $any($event.target).value)" [disabled]="savingGrade()" />
                  </div>
                </article>
              }
              @if (confirmGrade()) {
                <div class="alert alert-warning stack confirm" role="alertdialog" aria-labelledby="grade-confirm-title">
                  <p id="grade-confirm-title"><strong>¿Completar la calificación?</strong></p>
                  <p>
                    Se calculará la nota final con estos puntajes y el alumno verá si aprobó o desaprobó. Si aprueba, se
                    emitirá su certificado. La calificación no se podrá modificar después.
                  </p>
                  <div class="row">
                    <button type="button" class="btn btn-primary" [class.is-loading]="savingGrade()" [disabled]="savingGrade()" (click)="saveGrades()">Sí, completar calificación</button>
                    <button type="button" class="btn btn-secondary" [disabled]="savingGrade()" (click)="confirmGrade.set(false)">Revisar puntajes</button>
                  </div>
                </div>
              } @else {
                <div class="row">
                  <button type="button" class="btn btn-primary" (click)="askGrade()">Completar calificación</button>
                  <button type="button" class="btn btn-secondary" (click)="closeGrading()">Cancelar</button>
                </div>
              }
            }
          </section>
        }
        @if (gradeMessage()) { <p class="alert alert-success" role="status">{{ gradeMessage() }}</p> }

        @if (detail(); as d) {
          @if (d.loading) {
            <p class="card muted" role="status">Cargando el detalle…</p>
          } @else {
            <app-admin-attempt-detail [attempt]="d.attempt" [questions]="d.questions" [studentName]="nameOf(d.attempt.userId)"
              [courseName]="courseName(d.attempt.courseId)" [examTitle]="d.examTitle" (grade)="startGrading(d.attempt)" (closed)="detail.set(null)" />
          }
        }

        <!-- R7: gestión de recuperaciones (consulta, autorización y anulación) con los mismos filtros. -->
        <app-admin-recoveries [users]="users()" [courses]="courses()" [companies]="companies()" [courseId]="courseId()" [studentId]="studentId()"
          [company]="companyFilter()" [refresh]="refreshCount()" (changed)="load()" />

        <p class="small muted">
          {{ apiMode ? 'Datos del servidor.' : 'Datos de demostración.' }} Cada nota se muestra con la escala con la que se calificó. Un solo intento por alumno
          y examen. No incluye reportes avanzados en esta primera versión.
        </p>
      }
    </div>
  `,
  styles: [
    `
      td .badge { margin-left: 0.3rem; }
      .grading h2, .grading h3, .grading p { margin: 0; }
      .export { gap: 0.4rem; }
      .export p, .excluded { margin: 0; }
      .excluded { padding-left: 1.1rem; }
      .grading h3 { font-size: 1rem; }
      .answer { border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: var(--space-3); }
      .rubric { color: var(--c-muted); }
      .reply { display: grid; gap: 0.25rem; }
      .reply__text { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--c-bg); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); }
      .score { max-width: 14rem; margin: 0; }
      .confirm p { margin: 0; }
    `,
  ],
})
export class AdminResults {
  /** Modo API: sin recuperaciones (aún sin backend) y sin la nota de datos de demostración. */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));
  private readonly repo = inject(DataRepository);
  private readonly router = inject(Router);

  /** Parámetro ?curso= (vacío = todos los cursos). */
  readonly curso = input<string>();
  /** R7: ?estudiante= y ?empresa= (empresa existente o «sin-empresa»). */
  readonly estudiante = input<string>();
  readonly empresa = input<string>();
  readonly maxAttempts = MAX_ATTEMPTS;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly users = signal<User[]>([]);
  readonly courses = signal<CourseRecord[]>([]);
  private readonly allEnrollments = signal<Enrollment[]>([]);
  private readonly allAttempts = signal<Attempt[]>([]);
  /** R4: situación de recuperación de cada inscripción. */
  private readonly recoveryStates = signal<RecoveryState[]>([]);
  private readonly published = signal<Map<string, Set<string>>>(new Map());
  /** R7: empresas registradas (las de la demostración; no se crea ninguna). */
  readonly companies = signal<Company[]>([]);
  /** R7: detalle de la evaluación abierta (preguntas del examen rendido; no cambian por RN-15). */
  readonly detail = signal<{ attempt: Attempt; questions: ExamQuestion[]; examTitle: string; loading: boolean } | null>(null);
  /** R7: aumenta en cada recarga, para que la sección de recuperaciones se actualice. */
  readonly refreshCount = signal(0);
  /** R8: certificados (solo lectura) para la columna «Certificación» de la exportación. */
  private readonly allCertificates = signal<Certificate[]>([]);
  readonly exportMessage = signal('');

  /** M5: calificación manual del intento «En revisión» seleccionado. */
  readonly grading = signal<{ attempt: Attempt; questions: ExamQuestion[]; scores: Record<string, number | null>; loading: boolean } | null>(
    null,
  );
  readonly gradingError = signal('');
  readonly gradeMessage = signal('');
  readonly confirmGrade = signal(false);
  readonly savingGrade = signal(false);
  readonly pending = isPendingReview;
  /** R4: estado de la recuperación para la tabla. «Pendiente» solo si desaprobó (el ausente aún puede rendir el regular). */
  recoveryLabel(state: RecoveryState | null): string {
    if (!state?.status) return '—';
    if (state.status === 'pendiente' && state.reason !== 'Desaprobó el examen regular.') return '—';
    return RECOVERY_STATUS_LABELS[state.status];
  }

  /** R4: el intento regular fue reemplazado por una recuperación del mismo estudiante y curso. */
  replaced(a: Attempt): boolean {
    return a.kind !== 'recuperacion' && this.allAttempts().some((x) => x.kind === 'recuperacion' && x.userId === a.userId && x.courseId === a.courseId);
  }
  /** Etapa 2B (P3): puntos obtenidos frente al máximo, si el intento los guardó al rendir. */
  readonly points = attemptPoints;

  /** Hasta dos decimales, con coma decimal (por ejemplo, 96,67). */
  decimal(n: number): string {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  /** Curso filtrado; null = todos. Un curso inexistente en la URL se trata como «todos». */
  readonly courseId = computed(() => {
    const wanted = this.curso();
    return wanted && this.courses().some((c) => c.id === wanted) ? wanted : null;
  });

  /** R7: ?estudiante= (un participante existente; si no existe, todos). */
  readonly studentId = computed(() => {
    const wanted = this.estudiante();
    return wanted && this.users().some((u) => u.id === wanted && u.role === 'participant') ? wanted : null;
  });
  /** R7: ?empresa= (una empresa existente o 'sin-empresa'; si no existe, todas). */
  readonly companyFilter = computed(() => {
    const wanted = this.empresa();
    if (wanted === 'sin-empresa') return wanted;
    return wanted && this.companies().some((c) => c.id === wanted) ? wanted : null;
  });
  /** R7: estudiantes inscritos (en el curso filtrado, si lo hay), para el filtro. */
  readonly students = computed(() => {
    const id = this.courseId();
    const enrolled = new Set(this.allEnrollments().filter((e) => !id || e.courseId === id).map((e) => e.userId));
    return this.users().filter((u) => u.role === 'participant' && enrolled.has(u.id));
  });

  /** R7: filtros por estudiante y empresa (el de curso se aplica aparte). */
  private matches(userId: string): boolean {
    if (this.studentId() && userId !== this.studentId()) return false;
    const company = this.companyFilter();
    if (!company) return true;
    const own = this.users().find((u) => u.id === userId)?.companyId;
    return company === 'sin-empresa' ? !own : own === company;
  }

  /** Todos los intentos del filtro, incluidos los de cursos que el alumno ya no tiene asignados. */
  /** Filtro por fechas (18/11/2026): día en que se rindió, en hora de Lima; vacío = sin límite. */
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly dateFiltered = computed(() => !!(this.dateFrom() || this.dateTo()));

  private inDateRange(iso: string): boolean {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso));
    return (!this.dateFrom() || day >= this.dateFrom()) && (!this.dateTo() || day <= this.dateTo());
  }

  readonly history = computed(() => {
    const id = this.courseId();
    return this.allAttempts()
      .filter((a) => (!id || a.courseId === id) && this.matches(a.userId) && this.inDateRange(a.date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  /** R7: evaluaciones del filtro con preguntas abiertas sin calificar. */
  readonly pendingCount = computed(() => this.history().filter((a) => isPendingReview(a)).length);

  readonly rows = computed(() => {
    const id = this.courseId();
    return this.allEnrollments()
      .filter((e) => (!id || e.courseId === id) && this.matches(e.userId))
      .map((enrollment) => {
        const user = this.users().find((u) => u.id === enrollment.userId);
        if (!user) return null;
        const mine = this.history().filter((a) => a.userId === enrollment.userId && a.courseId === enrollment.courseId);
        // Con filtro de fechas, solo las inscripciones con alguna evaluación rendida en ese rango.
        if (this.dateFiltered() && mine.length === 0) return null;
        const recovery = this.recoveryStates().find((s) => s.userId === enrollment.userId && s.courseId === enrollment.courseId) ?? null;
        return {
          key: `${enrollment.userId}|${enrollment.courseId}`,
          user,
          enrollment,
          courseName: this.courseName(enrollment.courseId),
          percent: enrollmentPercent(enrollment, this.published()),
          // RN-07: intentos regulares (la recuperación se indica aparte).
          attempts: mine.filter((a) => a.kind !== 'recuperacion').length,
          // R4: nota regular, de recuperación y final (una sola vigente).
          result: courseResult(mine, recovery?.status === 'no_rindio'),
          recovery,
        };
      })
      .filter((r) => r !== null);
  });

  constructor() {
    this.load();
  }

  /** Carga (o recarga, por ejemplo tras autorizar o anular una recuperación) los datos de la página. */
  load(): void {
    forkJoin({
      users: this.repo.getUsers(),
      courses: this.repo.getCourses(),
      enrollments: this.repo.listEnrollments(),
      attempts: this.repo.listAttempts(),
      companies: this.repo.listCompanies(),
      certificates: this.repo.listCertificates(),
      recoveryStates: this.repo.listRecoveryStates(),
    })
      .pipe(
        switchMap((r) =>
          (r.courses.length ? forkJoin(r.courses.map((c) => this.repo.getCourseContent(c.id))) : of([])).pipe(
            map((contents) => ({ ...r, published: publishedVideoIds(contents) })),
          ),
        ),
      )
      .subscribe({
        next: (r) => {
          this.users.set(r.users);
          this.courses.set(r.courses);
          this.allEnrollments.set(r.enrollments);
          this.allAttempts.set(r.attempts);
          this.companies.set(r.companies);
          this.allCertificates.set(r.certificates);
          this.refreshCount.update((n) => n + 1);
          this.recoveryStates.set(r.recoveryStates);
          this.published.set(r.published);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errMsg(e));
          this.loading.set(false);
        },
      });
  }

  startGrading(attempt: Attempt): void {
    this.gradeMessage.set('');
    this.gradingError.set('');
    this.confirmGrade.set(false);
    this.grading.set({ attempt, questions: [], scores: {}, loading: true });
    this.repo.getExamQuestions(attempt.examId).subscribe({
      next: (all) => {
        const questions = all.filter((q) => q.type === 'open');
        this.grading.set({ attempt, questions, scores: Object.fromEntries(questions.map((q) => [q.id, null])), loading: false });
      },
      error: (e) => this.gradingError.set(errMsg(e)),
    });
  }

  closeGrading(): void {
    this.grading.set(null);
    this.confirmGrade.set(false);
  }

  answerOf(attempt: Attempt, questionId: string): string {
    return attempt.answers?.[questionId]?.[0]?.trim() ? attempt.answers[questionId][0] : '';
  }

  setScore(questionId: string, value: string): void {
    const g = this.grading();
    if (!g) return;
    this.grading.set({ ...g, scores: { ...g.scores, [questionId]: value === '' ? null : Number(value) } });
  }

  /** Antes de confirmar, todas las preguntas abiertas deben tener puntaje (el repositorio vuelve a validarlo). */
  askGrade(): void {
    const g = this.grading();
    if (!g) return;
    const missing = g.questions.filter((q) => g.scores[q.id] === null || g.scores[q.id] === undefined);
    if (missing.length) {
      this.gradingError.set(`Asigna un puntaje a ${missing.length === 1 ? 'la pregunta pendiente' : `las ${missing.length} preguntas pendientes`}.`);
      return;
    }
    this.gradingError.set('');
    this.confirmGrade.set(true);
  }

  saveGrades(): void {
    const g = this.grading();
    if (!g) return;
    this.savingGrade.set(true);
    const grades = g.questions.map((q) => ({ questionId: q.id, score: g.scores[q.id] as number }));
    this.repo.gradeOpenAnswers(g.attempt.id, grades).subscribe({
      next: (attempt) => {
        this.savingGrade.set(false);
        this.closeGrading();
        this.gradeMessage.set(
          `Calificación completada${DEMO_SUFFIX}: ${this.nameOf(attempt.userId)} obtuvo ${attempt.score} / ${attempt.scaleMax}, ` +
            (attempt.passed ? 'aprobado. Se emitió su certificado.' : 'desaprobado.'),
        );
        this.load();
        // R7: si su detalle estaba abierto, se muestra ya calificado.
        if (this.detail()?.attempt.id === attempt.id) this.openDetail(attempt);
      },
      error: (e) => {
        this.savingGrade.set(false);
        this.confirmGrade.set(false);
        this.gradingError.set(errMsg(e));
      },
    });
  }

  selectCourse(courseId: string): void {
    this.router.navigate([], { queryParams: { curso: courseId || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /**
   * R8: filas del reporte, a partir de `rows()` (la misma tabla «Estado por inscripción», con los filtros de R7 ya
   * aplicados): una por estudiante y curso, sin recalcular notas. Solo resultados definitivos:
   * - se incluyen Aprobado y Desaprobado (también quien no rindió su recuperación: conserva su nota regular, o queda
   *   sin nota si no la tenía);
   * - se excluyen los pendientes de calificación, quienes todavía no rindieron y quienes tienen una recuperación en
   *   curso (decisión del 11/11/2026: su resultado aún puede cambiar).
   * «Certificación»: «Certificado emitido» solo con un certificado vigente del curso (un revocado cuenta como
   * «Pendiente», decisión del 11/11/2026).
   */
  readonly exportPlan = computed(() => {
    const rows: string[][] = [];
    let pending = 0;
    let notTaken = 0;
    let inRecovery = 0;
    for (const r of this.rows()) {
      if (r.recovery?.status === 'autorizada') {
        inRecovery++;
        continue;
      }
      const { condition, final } = r.result;
      if (condition === 'en_revision') {
        pending++;
        continue;
      }
      if (condition === 'sin_resultado') {
        notTaken++;
        continue;
      }
      const certified = this.allCertificates().some(
        (c) => c.userId === r.user.id && c.courseId === r.enrollment.courseId && c.status === 'vigente',
      );
      rows.push([
        r.user.fullName,
        r.user.dni || 'No registrado',
        this.reportCompany(r.user),
        r.courseName,
        final ? `${final.score} / ${final.scaleMax}` : '',
        condition === 'aprobado' ? 'Aprobado' : 'Desaprobado',
        certified ? 'Certificado emitido' : 'Pendiente',
      ]);
    }
    return { rows, pending, notTaken, inRecovery };
  });

  /** R8: descarga el .xlsx (cinco columnas exactas). Sin resultados no descarga nada. */
  exportExcel(): void {
    const plan = this.exportPlan();
    if (plan.rows.length === 0) {
      this.exportMessage.set('No hay resultados definitivos para exportar con estos filtros: no se generó ningún archivo.');
      return;
    }
    const day = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10); // fecha de Lima
    const filename = `evaluaciones-rendidas-${day}.xlsx`;
    downloadFile(buildXlsx([[...EXPORT_HEADERS], ...plan.rows], { sheetName: 'Evaluaciones rendidas', widths: EXPORT_WIDTHS }), filename);
    this.exportMessage.set(`Se descargó «${filename}» con ${plan.rows.length} ${plan.rows.length === 1 ? 'resultado' : 'resultados'}.`);
  }

  /** CSV (23/11/2026): las mismas filas y filtros que el Excel, sin fórmulas ejecutables. */
  exportCsv(): void {
    const plan = this.exportPlan();
    if (plan.rows.length === 0) {
      this.exportMessage.set('No hay resultados definitivos para exportar con estos filtros: no se generó ningún archivo.');
      return;
    }
    const day = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    const filename = `evaluaciones-rendidas-${day}.csv`;
    downloadFile(buildCsv([[...EXPORT_HEADERS], ...plan.rows]), filename, CSV_MIME);
    this.exportMessage.set(`Se descargó «${filename}» con ${plan.rows.length} ${plan.rows.length === 1 ? 'resultado' : 'resultados'}.`);
  }

  /** Reporte PDF (18/11/2026): las mismas filas y filtros que el Excel, con el contexto de los filtros aplicados. */
  exportPdf(): void {
    const plan = this.exportPlan();
    if (plan.rows.length === 0) {
      this.exportMessage.set('No hay resultados definitivos para exportar con estos filtros: no se generó ningún archivo.');
      return;
    }
    const filters = [
      `Curso: ${this.courseId() ? this.courseName(this.courseId()!) : 'todos'}`,
      `Estudiante: ${this.students().find((u) => u.id === this.studentId())?.fullName ?? 'todos'}`,
      `Empresa: ${this.companyFilter() === 'sin-empresa' ? 'sin empresa' : (this.companies().find((c) => c.id === this.companyFilter())?.name ?? 'todas')}`,
      `Rendidas: ${this.dateFrom() || 'sin inicio'} a ${this.dateTo() || 'hoy'}`,
    ].join(' · ');
    const day = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    const filename = `evaluaciones-rendidas-${day}.pdf`;
    buildPdfReport({
      title: 'Reporte de evaluaciones rendidas',
      subtitle: [filters, `${plan.rows.length} resultados definitivos (se excluyen los pendientes de calificación y los no rendidos).`],
      headers: [...EXPORT_HEADERS],
      rows: plan.rows.map((r) => r.map(String)),
      widths: EXPORT_WIDTHS,
    }).save(filename);
    this.exportMessage.set(`Se descargó «${filename}» con ${plan.rows.length} ${plan.rows.length === 1 ? 'resultado' : 'resultados'}.`);
  }

  /** R7: filtros por estudiante y empresa en la URL (vacío = todos). */
  selectFilter(key: 'estudiante' | 'empresa', value: string): void {
    this.detail.set(null);
    this.router.navigate([], { queryParams: { [key]: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Reportes (23/11/2026): todas las empresas en una sola fila (sin duplicar al estudiante); sin empresa, se indica. */
  private reportCompany(user: User): string {
    return user.companyNames?.length ? user.companyNames.join(', ') : this.companyName(user);
  }

  /** R7: empresa del estudiante, o «Sin empresa» si no tiene una registrada (no se inventa). */
  companyName(user: User): string {
    return (user.companyId && this.companies().find((c) => c.id === user.companyId)?.name) || 'Sin empresa';
  }

  /** R7: detalle de una evaluación: las preguntas del examen que se rindió y su título. */
  openDetail(attempt: Attempt): void {
    this.detail.set({ attempt, questions: [], examTitle: '', loading: true });
    forkJoin({ questions: this.repo.getExamQuestions(attempt.examId), exams: this.repo.getExams(attempt.courseId) }).subscribe({
      next: (r) => {
        const examTitle = r.exams.find((e) => e.id === attempt.examId)?.title ?? '—';
        this.detail.set({ attempt, questions: r.questions, examTitle, loading: false });
      },
      error: (e) => {
        this.detail.set(null);
        this.error.set(errMsg(e));
      },
    });
  }

  isEnrolled(userId: string, courseId: string): boolean {
    return this.allEnrollments().some((e) => e.userId === userId && e.courseId === courseId);
  }

  nameOf(userId: string): string {
    return this.users().find((u) => u.id === userId)?.fullName ?? '—';
  }

  courseName(courseId: string): string {
    return this.courses().find((c) => c.id === courseId)?.name ?? '—';
  }
}
