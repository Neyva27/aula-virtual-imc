import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { DatePipe } from '@angular/common';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { AuthService } from '../../core/services/auth.service';
import { Company, User } from '../../core/models/user.model';
import { CourseRecord } from '../../core/models/course.model';
import { Attempt, Exam, examKind, isPendingReview } from '../../core/models/exam.model';
import { Recovery, RecoveryState } from '../../core/models/recovery.model';
import { errMsg } from './admin-utils';

const H = 3_600_000;
/** «YYYY-MM-DDTHH:mm» en hora de Lima (para los campos de fecha y hora). */
const toLimaInput = (ms: number) => new Date(ms - 5 * H).toISOString().slice(0, 16);
/** Valor de un campo de fecha y hora (hora de Lima) → ISO con la zona -05:00, como lo exige el repositorio. */
const fromLimaInput = (value: string) => (value ? `${value}:00-05:00` : '');

interface ExamInfo {
  exam: Exam;
  count: number;
}

/**
 * Recuperaciones en «Evaluaciones rendidas». Decisión definitiva (20/11/2026): la recuperación es una NUEVA
 * OPORTUNIDAD PARA RENDIR EL EXAMEN ORIGINAL del curso (mismas preguntas, escala, nota mínima y duración); no se elige
 * modalidad ni se crean exámenes. Solo para desaprobados, una por estudiante y curso, solo el Instructor dueño.
 * Muestra el estudiante (nombre, DNI, empresa), su nota regular, el estado del examen y de la recuperación, y las
 * fechas de autorización, apertura y cierre. El repositorio vuelve a validar todo; esta vista no cambia notas.
 */
@Component({
  selector: 'app-admin-recoveries',
  imports: [DatePipe],
  template: `
    <section class="stack" aria-labelledby="recoveries-title" data-recoveries [attr.data-loaded]="loaded() ? '' : null">
      <h2 id="recoveries-title">Recuperaciones</h2>
      <p class="small muted">Una recuperación es una nueva oportunidad para rendir el <strong>examen original</strong> del curso, con sus mismas preguntas, escala, nota mínima y duración.</p>
      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      <!-- Desaprobados que pueden recibir una nueva oportunidad (con el filtro de curso, estudiante y empresa de la página). -->
      <section class="card stack" aria-labelledby="authorize-title" data-authorize>
        <h3 id="authorize-title">Autorizar recuperación</h3>
        @if (eligible().length === 0) {
          <p class="small muted">Con este filtro no hay estudiantes desaprobados que puedan recibir una recuperación.</p>
        } @else {
          <div class="table-wrap table-cards">
            <table>
              <caption class="sr-only">Estudiantes desaprobados que pueden recibir una recuperación</caption>
              <thead>
                <tr>
                  <th scope="col">Estudiante</th><th scope="col">DNI</th><th scope="col">Empresa</th><th scope="col">Curso</th>
                  <th scope="col">Nota del examen regular</th><th scope="col">Estado del examen</th><th scope="col">Recuperación</th>
                  <th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (s of eligible(); track s.userId + s.courseId) {
                  <tr [attr.data-eligible]="s.userId + '|' + s.courseId" [class.is-chosen]="chosenKey() === s.userId + '|' + s.courseId">
                    <td data-label="Estudiante">{{ nameOf(s.userId) }}</td>
                    <td data-label="DNI">{{ dniOf(s.userId) }}</td>
                    <td data-label="Empresa">{{ companyOf(s.userId) }}</td>
                    <td data-label="Curso">{{ courseName(s.courseId) }}</td>
                    <td data-label="Nota del examen regular">{{ regularGrade(s.userId, s.courseId) }}</td>
                    <td data-label="Estado del examen"><span class="badge badge--danger">Desaprobado</span></td>
                    <td data-label="Recuperación">{{ s.status === 'anulada' ? 'Anulada antes (sin usar)' : 'Sin recuperación' }}</td>
                    <td class="actions">
                      <button type="button" class="btn btn-primary btn-sm" (click)="choose(s.userId + '|' + s.courseId)"
                        [attr.aria-label]="'Autorizar recuperación a ' + nameOf(s.userId) + ' en ' + courseName(s.courseId)">Autorizar recuperación</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (chosen(); as c) {
          <section class="stack confirm" aria-labelledby="confirm-title" data-confirm>
            <h4 id="confirm-title">Nueva oportunidad para {{ nameOf(c.userId) }}</h4>
            @if (regularOf(c.courseId); as regular) {
              <dl class="data" data-original>
                <div><dt>Estudiante</dt><dd>{{ nameOf(c.userId) }} · DNI {{ dniOf(c.userId) }}</dd></div>
                <div><dt>Empresa</dt><dd>{{ companyOf(c.userId) }}</dd></div>
                <div><dt>Curso</dt><dd>{{ courseName(c.courseId) }}</dd></div>
                <div><dt>Nota del examen regular</dt><dd>{{ regularGrade(c.userId, c.courseId) }} · Desaprobado</dd></div>
                <div><dt>Examen que rendirá</dt><dd>«{{ regular.title }}» (examen original, sin cambios)</dd></div>
                <div><dt>Configuración</dt><dd>Sobre {{ regular.scaleMax }} · nota mínima {{ regular.passScore }} · {{ regular.timeMinutes }} minutos · {{ questionCount(regular.id) }} preguntas · 1 intento</dd></div>
              </dl>
              <div class="grid grid-2">
                <div class="field">
                  <label for="rec-opens">Apertura (hora de Lima)</label>
                  <input id="rec-opens" class="input" type="datetime-local" [value]="opens()" (input)="opens.set($any($event.target).value)" />
                </div>
                <div class="field">
                  <label for="rec-closes">Cierre (hora de Lima)</label>
                  <input id="rec-closes" class="input" type="datetime-local" [value]="closes()" (input)="closes.set($any($event.target).value)" />
                </div>
              </div>
              @if (opens() && closes()) {
                <p class="alert alert-info small" data-summary>
                  Se autorizará una <strong>nueva oportunidad para rendir el examen original «{{ regular.title }}»</strong>.
                  Podrá iniciarla desde el {{ opensIso() | date: 'dd/MM/yyyy HH:mm' : '-0500' }} hasta el
                  {{ closesIso() | date: 'dd/MM/yyyy HH:mm' : '-0500' }} (hora de Lima). Su nota de recuperación será la nota vigente, aunque sea menor.
                </p>
              }
              @if (formError()) { <p class="alert alert-danger" role="alert">{{ formError() }}</p> }
              <div class="row">
                <button type="button" class="btn btn-primary" [class.is-loading]="busy()" [disabled]="busy() || !opens() || !closes()" (click)="authorize()">Confirmar autorización</button>
                <button type="button" class="btn btn-secondary" (click)="choose('')">Cancelar</button>
              </div>
            } @else {
              <p class="alert alert-warning small">El curso no tiene un examen regular.</p>
            }
          </section>
        }
      </section>

      <h3 class="list-title">Recuperaciones autorizadas</h3>
      @if (rows().length === 0) {
        <p class="card muted">No hay recuperaciones autorizadas con este filtro.</p>
      } @else {
        <div class="table-wrap table-cards">
          <table>
            <caption class="sr-only">Recuperaciones autorizadas</caption>
            <thead>
              <tr>
                <th scope="col">Estudiante</th><th scope="col">DNI</th><th scope="col">Empresa</th><th scope="col">Curso</th>
                <th scope="col">Examen</th><th scope="col">Nota regular</th><th scope="col">Estado de la recuperación</th>
                <th scope="col">Autorizada</th><th scope="col">Apertura</th><th scope="col">Cierre</th>
                <th scope="col">Inicio</th><th scope="col">Nota de recuperación</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr [attr.data-recovery]="r.id">
                  <td data-label="Estudiante">{{ nameOf(r.userId) }}</td>
                  <td data-label="DNI">{{ dniOf(r.userId) }}</td>
                  <td data-label="Empresa">{{ companyOf(r.userId) }}</td>
                  <td data-label="Curso">{{ courseName(r.courseId) }}</td>
                  <td data-label="Examen">{{ examTitle(r.examId) }} <span class="small muted">({{ r.mode === 'independiente' ? 'registro anterior' : 'examen original' }})</span></td>
                  <td data-label="Nota regular">{{ regularGrade(r.userId, r.courseId) }}</td>
                  <td data-label="Estado de la recuperación">{{ statusOf(r) }}</td>
                  <td data-label="Autorizada">{{ r.authorizedAt | date: 'dd/MM/yyyy HH:mm' : '-0500' }}</td>
                  <td data-label="Apertura">{{ r.opensAt | date: 'dd/MM/yyyy HH:mm' : '-0500' }}</td>
                  <td data-label="Cierre">{{ r.closesAt | date: 'dd/MM/yyyy HH:mm' : '-0500' }}</td>
                  <td data-label="Inicio">
                    @if (r.startedAt) { {{ r.startedAt | date: 'dd/MM/yyyy HH:mm' : '-0500' }} } @else { No iniciada }
                  </td>
                  <td data-label="Nota de recuperación">{{ gradeOf(r) }}</td>
                  <td class="actions">
                    @if (canCancel(r)) {
                      @if (confirmCancel() === r.id) {
                        <button type="button" class="btn btn-danger btn-sm" (click)="cancel(r)" [disabled]="busy()">Confirmar anulación</button>
                        <button type="button" class="btn btn-ghost btn-sm" (click)="confirmCancel.set(null)">No</button>
                      } @else {
                        <button type="button" class="btn btn-ghost btn-sm" (click)="confirmCancel.set(r.id)" [attr.aria-label]="'Anular la recuperación de ' + nameOf(r.userId)">Anular</button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="small muted">Fechas y horas en hora de Lima. La ventana solo limita el inicio: quien inicia a tiempo tiene la duración completa del examen.</p>
      }
    </section>
  `,
  styles: [
    `
      [data-authorize] h3, .list-title, .confirm h4 { margin: 0; }
      .confirm { border-top: 1px solid var(--c-border); padding-top: 0.75rem; }
      tr.is-chosen td { background: var(--c-primary-soft, rgba(0, 120, 200, 0.06)); }
      .table-wrap { position: relative; }
    `,
  ],
})
export class AdminRecoveries {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);

  readonly users = input<User[]>([]);
  readonly courses = input<CourseRecord[]>([]);
  /** Empresas para mostrar el nombre de la empresa del estudiante. */
  readonly companies = input<Company[]>([]);
  /** Filtros de la página (null = todos). `company` es un id de empresa o 'sin-empresa'. */
  readonly courseId = input<string | null>(null);
  readonly studentId = input<string | null>(null);
  readonly company = input<string | null>(null);
  /** Cambia cuando la página recarga sus datos (por ejemplo, tras calificar). */
  readonly refresh = input(0);
  /** Se autorizó o anuló: la página recarga el estado de las inscripciones. */
  readonly changed = output<void>();

  readonly recoveries = signal<Recovery[]>([]);
  private readonly states = signal<RecoveryState[]>([]);
  private readonly attempts = signal<Attempt[]>([]);
  private readonly exams = signal<ExamInfo[]>([]);
  readonly message = signal('');
  readonly error = signal('');
  readonly formError = signal('');
  readonly busy = signal(false);
  /** Ya se cargaron los datos de las recuperaciones (al menos una vez). */
  readonly loaded = signal(false);
  readonly confirmCancel = signal<string | null>(null);

  readonly chosenKey = signal('');
  readonly opens = signal('');
  readonly closes = signal('');

  constructor() {
    effect(() => {
      this.refresh();
      const courses = this.courses();
      untracked(() => this.load(courses));
    });
  }

  private load(courses: CourseRecord[]): void {
    forkJoin({
      recoveries: this.repo.listRecoveries(),
      states: this.repo.listRecoveryStates(),
      attempts: this.repo.listAttempts(),
      exams: courses.length ? forkJoin(courses.map((c) => this.repo.getExams(c.id))) : of<Exam[][]>([]),
    })
      .pipe(
        switchMap((r) => {
          const exams = r.exams.flat();
          return (exams.length ? forkJoin(exams.map((e) => this.repo.getExamQuestions(e.id))) : of([])).pipe(
            map((qs) => ({ ...r, exams: exams.map((exam, i) => ({ exam, count: qs[i].length })) })),
          );
        }),
      )
      .subscribe({
        next: (r) => {
          this.recoveries.set(r.recoveries);
          this.states.set(r.states);
          this.attempts.set(r.attempts);
          this.exams.set(r.exams);
          this.loaded.set(true);
        },
        error: (e) => this.error.set(errMsg(e)),
      });
  }

  // ----- Filtros -----
  private matches(userId: string, courseId: string): boolean {
    if (this.courseId() && courseId !== this.courseId()) return false;
    if (this.studentId() && userId !== this.studentId()) return false;
    const company = this.company();
    if (company) {
      const own = this.users().find((u) => u.id === userId)?.companyId;
      if (company === 'sin-empresa' ? !!own : own !== company) return false;
    }
    return true;
  }

  readonly rows = computed(() =>
    this.recoveries()
      .filter((r) => this.matches(r.userId, r.courseId))
      .sort((a, b) => Date.parse(b.authorizedAt) - Date.parse(a.authorizedAt)),
  );

  /** Quienes pueden recibir una recuperación ahora: desaprobados sin una recuperación vigente. */
  readonly eligible = computed(() =>
    this.states().filter((s) => (s.status === 'pendiente' || s.status === 'anulada') && this.matches(s.userId, s.courseId)),
  );

  readonly chosen = computed(() => {
    const [userId, courseId] = this.chosenKey().split('|');
    return userId && courseId ? { userId, courseId } : null;
  });

  // ----- Exámenes -----
  regularOf(courseId: string): Exam | null {
    return this.exams().find((x) => x.exam.courseId === courseId && x.exam.active && examKind(x.exam) === 'regular')?.exam ?? null;
  }

  questionCount(examId: string): number {
    return this.exams().find((x) => x.exam.id === examId)?.count ?? 0;
  }

  readonly opensIso = computed(() => fromLimaInput(this.opens()));
  readonly closesIso = computed(() => fromLimaInput(this.closes()));

  choose(key: string): void {
    this.chosenKey.set(key);
    this.formError.set('');
    this.message.set('');
    if (key) {
      // Por defecto: desde el próximo cuarto de hora y durante 2 días (el Instructor los puede cambiar).
      const start = Math.ceil((Date.now() + 60_000) / (15 * 60_000)) * 15 * 60_000;
      this.opens.set(toLimaInput(start));
      this.closes.set(toLimaInput(start + 48 * H));
    }
  }

  authorize(): void {
    const c = this.chosen();
    const instructor = this.auth.user();
    if (!c || !this.opens() || !this.closes() || this.busy()) return;
    if (!instructor) {
      this.formError.set('Inicia sesión como Instructor para autorizar recuperaciones.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    this.repo
      .authorizeRecovery(instructor.id, { userId: c.userId, courseId: c.courseId, mode: 'original', opensAt: this.opensIso(), closesAt: this.closesIso() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.message.set(`Recuperación autorizada${DEMO_SUFFIX} para ${this.nameOf(c.userId)} en ${this.courseName(c.courseId)}: rendirá el examen original.`);
          this.chosenKey.set('');
          this.load(this.courses());
          this.changed.emit();
        },
        error: (e) => {
          this.busy.set(false);
          this.formError.set(errMsg(e));
        },
      });
  }

  // ----- Estado de cada autorización -----
  private attemptOf(r: Recovery): Attempt | undefined {
    return r.attemptId ? this.attempts().find((a) => a.id === r.attemptId) : undefined;
  }

  statusOf(r: Recovery): string {
    if (r.cancelledAt) return 'Anulada';
    if (r.attemptId) return this.attemptOf(r) && isPendingReview(this.attemptOf(r)!) ? 'Rendida · pendiente de calificación' : 'Rendida';
    if (r.noShowAt) return 'No rindió recuperación';
    if (r.startedAt) return 'Iniciada · en curso';
    return Date.now() < Date.parse(r.opensAt) ? 'Autorizada · aún no abre' : 'Autorizada · disponible';
  }

  gradeOf(r: Recovery): string {
    const a = this.attemptOf(r);
    if (!a) return '—';
    return isPendingReview(a) ? 'Pendiente de calificación' : `${a.score} / ${a.scaleMax} · ${a.passed ? 'Aprobado' : 'Desaprobado'}`;
  }

  /** Nota del último intento regular del estudiante en el curso (nunca la de la recuperación). */
  regularGrade(userId: string, courseId: string): string {
    const a = this.attempts()
      .filter((x) => x.userId === userId && x.courseId === courseId && (x.kind ?? 'regular') === 'regular')
      .sort((x, y) => Date.parse(y.date) - Date.parse(x.date))[0];
    if (!a) return '—';
    return isPendingReview(a) ? 'Pendiente de calificación' : `${a.score} / ${a.scaleMax}`;
  }

  /** R3: solo antes del inicio y antes del cierre (anulada, iniciada, rendida o no rendida ya no). */
  canCancel(r: Recovery): boolean {
    return !r.cancelledAt && !r.startedAt && !r.attemptId && !r.noShowAt && Date.now() < Date.parse(r.closesAt);
  }

  cancel(r: Recovery): void {
    const instructor = this.auth.user();
    if (!instructor || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.repo.cancelRecovery(instructor.id, r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmCancel.set(null);
        this.message.set(`Recuperación anulada${DEMO_SUFFIX}: ${this.nameOf(r.userId)} conserva su oportunidad.`);
        this.load(this.courses());
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.confirmCancel.set(null);
        this.error.set(errMsg(e));
      },
    });
  }

  nameOf(userId: string): string {
    return this.users().find((u) => u.id === userId)?.fullName ?? '—';
  }

  dniOf(userId: string): string {
    return this.users().find((u) => u.id === userId)?.dni ?? '—';
  }

  companyOf(userId: string): string {
    const id = this.users().find((u) => u.id === userId)?.companyId;
    return (id && this.companies().find((c) => c.id === id)?.name) || 'Sin empresa';
  }

  courseName(courseId: string): string {
    return this.courses().find((c) => c.id === courseId)?.name ?? '—';
  }

  examTitle(examId: string): string {
    return this.exams().find((x) => x.exam.id === examId)?.exam.title ?? '—';
  }
}
