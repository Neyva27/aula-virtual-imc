import { Component, computed, inject, signal } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { AbstractControl, ValidationErrors, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { WHATSAPP_ERROR, isValidWhatsapp } from '../../core/models/student.model';
import { forkJoin, of, switchMap, map } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { User } from '../../core/models/user.model';
import { CourseRecord, Enrollment } from '../../core/models/course.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { Icon } from '../../shared/components/icon';
import { ProgressBar } from '../../shared/components/progress-bar';
import { enrollmentPercent, errMsg, publishedVideoIds } from './admin-utils';

interface CourseAssignment {
  enrollment: Enrollment;
  course: CourseRecord | null;
  percent: number;
}

@Component({
  selector: 'app-admin-participants',
  imports: [ReactiveFormsModule, StatusBadge, ProgressBar, Icon],
  template: `
    <div class="stack">
      <header class="row between page-head">
        <div>
          <h1>Participantes</h1>
          <p class="muted">La empresa registra a cada participante, le asigna sus cursos y le entrega sus credenciales.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="toggleForm()">
          <app-icon [name]="showForm() ? 'x' : 'plus'" size="sm" />
          {{ showForm() ? 'Cancelar' : 'Registrar participante' }}
        </button>
      </header>

      @if (created(); as c) {
        <p class="alert alert-success" role="status">
          Participante registrado: <strong>{{ c.fullName }}</strong>. Usuario: {{ c.email }} · Contraseña de
          demostración: <strong>{{ demoPassword }}</strong>.
        </p>
      }
      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (showForm()) {
        <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="new-participant-title">
          <h2 id="new-participant-title">Nuevo participante</h2>
          <div class="grid grid-3">
            <div class="field">
              <label for="p-name">Nombres y apellidos</label>
              <input id="p-name" class="input" formControlName="fullName" [class.is-invalid]="bad('fullName')" />
              @if (bad('fullName')) { <span class="error-text">Ingresa nombres y apellidos.</span> }
            </div>
            <div class="field">
              <label for="p-email">Correo electrónico</label>
              <input id="p-email" class="input" type="email" formControlName="email" [class.is-invalid]="bad('email')" />
              @if (bad('email')) { <span class="error-text">Ingresa un correo válido.</span> }
            </div>
            <div class="field">
              <label for="p-dni">DNI</label>
              <input id="p-dni" class="input" inputmode="numeric" maxlength="8" formControlName="dni" [class.is-invalid]="bad('dni')" />
              @if (bad('dni')) { <span class="error-text">El DNI debe tener 8 dígitos.</span> }
            </div>
            <div class="field">
              <label for="p-whatsapp">Número de WhatsApp (opcional)</label>
              <input id="p-whatsapp" class="input" type="tel" inputmode="tel" maxlength="24" placeholder="987654321 o +51987654321" formControlName="whatsapp" [class.is-invalid]="bad('whatsapp')" />
              @if (bad('whatsapp')) { <span class="error-text">{{ whatsappError }}</span> }
            </div>
          </div>
          <fieldset class="field courses-field">
            <legend>Cursos asignados (opcional)</legend>
            @for (c of courses(); track c.id) {
              <label class="check">
                <input type="checkbox" [checked]="newCourses().includes(c.id)" (change)="toggleNewCourse(c.id)" />
                <span>{{ c.name }} <span class="badge" [class]="c.status === 'publicado' ? 'badge--success' : 'badge--warning'">{{ c.status === 'publicado' ? 'Publicado' : 'Borrador' }}</span></span>
              </label>
            }
            <span class="small muted">Puedes asignar o retirar cursos después.</span>
          </fieldset>
          <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()">
            Registrar
          </button>
          <p class="small muted">Demostración: se guarda solo en este navegador, no en un servidor.</p>
        </form>
      }

      <div class="field search">
        <label for="filter" class="sr-only">Buscar participante</label>
        <input id="filter" class="input" placeholder="Buscar por nombre o correo" (input)="onFilter($event)" />
      </div>

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (rows().length === 0) {
        <p class="card muted">No hay participantes que coincidan.</p>
      } @else {
        <div class="table-wrap table-cards">
          <table>
            <caption class="sr-only">Participantes y sus cursos asignados</caption>
            <thead>
              <tr><th scope="col">Participante</th><th scope="col">Cursos asignados</th><th scope="col">Asignar curso</th></tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.user.id) {
                <tr [attr.data-user]="r.user.id">
                  <td data-label="Participante">
                    <strong>{{ r.user.fullName }}</strong>
                    <span class="small muted block">{{ r.user.email }}</span>
                  </td>
                  <td data-label="Cursos asignados">
                    @if (r.assignments.length === 0) {
                      <span class="muted">Sin cursos asignados</span>
                    } @else {
                      <ul class="assignments">
                        @for (a of r.assignments; track a.enrollment.courseId) {
                          <li [attr.data-course]="a.enrollment.courseId">
                            <div class="assignment-head">
                              <span class="course-name">{{ a.course?.name ?? 'Curso no disponible' }}</span>
                              <app-status-badge [status]="a.enrollment.status" />
                            </div>
                            <div class="progress">
                              <app-progress-bar [value]="a.percent" [label]="'Progreso en ' + (a.course?.name ?? 'el curso')" />
                              <span class="small">{{ a.percent }}%</span>
                            </div>
                            @if (confirmRemove() === key(r.user.id, a.enrollment.courseId)) {
                              <div class="row confirm">
                                <span class="small">¿Retirar este curso? El participante y su historial se conservan.</span>
                                <button type="button" class="btn btn-danger btn-sm" (click)="remove(r.user, a)">Retirar</button>
                                <button type="button" class="btn btn-ghost btn-sm" (click)="confirmRemove.set(null)">Cancelar</button>
                              </div>
                            } @else {
                              <button type="button" class="btn btn-ghost btn-sm small-btn is-danger" (click)="askRemove(r.user.id, a.enrollment.courseId)"
                                [attr.aria-label]="'Retirar ' + (a.course?.name ?? 'curso') + ' de ' + r.user.fullName">
                                Retirar curso
                              </button>
                            }
                          </li>
                        }
                      </ul>
                    }
                  </td>
                  <td data-label="Asignar curso" class="assign">
                    @if (r.available.length === 0) {
                      <span class="small muted">Tiene todos los cursos asignados.</span>
                    } @else {
                      <div class="row assign-row">
                        <label class="sr-only" [for]="'assign-' + r.user.id">Curso para asignar a {{ r.user.fullName }}</label>
                        <select class="input" [id]="'assign-' + r.user.id" (change)="pick(r.user.id, $any($event.target).value)">
                          <option value="" [selected]="!picked()[r.user.id]">Elige un curso…</option>
                          @for (c of r.available; track c.id) {
                            <option [value]="c.id" [selected]="picked()[r.user.id] === c.id">{{ c.name }}{{ c.status === 'borrador' ? ' (borrador)' : '' }}</option>
                          }
                        </select>
                        <button type="button" class="btn btn-secondary" [disabled]="!picked()[r.user.id] || busy()" (click)="assign(r.user)">Asignar</button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .between { align-items: flex-start; }
      /* Solo margin-bottom: la separación con el encabezado la da .stack (V3). */
      .search { max-width: 360px; margin-bottom: 0; }
      .block { display: block; }
      .courses-field { border: 0; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.4rem; min-width: 0; }
      .courses-field legend { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.35rem; }
      .check { display: flex; align-items: flex-start; gap: 0.5rem; }
      .check input { flex: none; margin-top: 0.25rem; }
      .assignments { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
      .assignments li { display: grid; gap: 0.3rem; }
      .assignments li + li { border-top: 1px dashed var(--c-border); padding-top: 0.6rem; }
      .assignment-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
      .course-name { font-weight: 600; }
      .progress { display: flex; align-items: center; gap: 0.5rem; max-width: 260px; }
      .progress app-progress-bar { flex: 1; }
      .small-btn { justify-self: start; }
      .confirm { gap: 0.4rem; }
      .assign { min-width: 240px; }
      .assign-row { flex-wrap: nowrap; gap: 0.4rem; }
      .assign-row .input { min-width: 0; flex: 1; }
      @media (max-width: 700px) { .assign { min-width: 0; } .assign-row { flex-wrap: wrap; } }
    `,
  ],
})
export class AdminParticipants {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly demoPassword = DEMO_CONFIG.demoPassword;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly showForm = signal(false);
  readonly created = signal<User | null>(null);
  readonly filter = signal('');
  readonly newCourses = signal<string[]>([]);
  /** Curso elegido en el selector «Asignar curso» de cada participante. */
  readonly picked = signal<Record<string, string>>({});
  readonly confirmRemove = signal<string | null>(null);

  readonly users = signal<User[]>([]);
  readonly courses = signal<CourseRecord[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  private readonly published = signal<Map<string, Set<string>>>(new Map());

  readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    dni: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
    whatsapp: ['', [(c: AbstractControl): ValidationErrors | null => (isValidWhatsapp(String(c.value ?? '')) ? null : { whatsapp: true })]],
  });
  readonly whatsappError = WHATSAPP_ERROR;

  readonly rows = computed(() => {
    const f = this.filter().trim().toLowerCase();
    const courses = this.courses();
    return this.users()
      .filter((u) => u.role === 'participant')
      .filter((u) => !f || u.fullName.toLowerCase().includes(f) || u.email.toLowerCase().includes(f))
      .map((user) => {
        const mine = this.enrollments().filter((e) => e.userId === user.id);
        const assignments: CourseAssignment[] = mine.map((enrollment) => ({
          enrollment,
          course: courses.find((c) => c.id === enrollment.courseId) ?? null,
          percent: enrollmentPercent(enrollment, this.published()),
        }));
        const assigned = new Set(mine.map((e) => e.courseId));
        return { user, assignments, available: courses.filter((c) => !assigned.has(c.id)) };
      });
  });

  constructor() {
    this.refresh();
  }

  refresh(): void {
    forkJoin({
      users: this.repo.getUsers(),
      enrollments: this.repo.listEnrollments(),
      courses: this.repo.getCourses(),
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
          this.enrollments.set(r.enrollments);
          this.courses.set(r.courses);
          this.published.set(r.published);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errMsg(e));
          this.loading.set(false);
        },
      });
  }

  key(userId: string, courseId: string): string {
    return `${userId}|${courseId}`;
  }

  onFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.newCourses.set([]);
    this.clearMessages();
  }

  toggleNewCourse(courseId: string): void {
    this.newCourses.update((list) => (list.includes(courseId) ? list.filter((id) => id !== courseId) : [...list, courseId]));
  }

  bad(name: 'fullName' | 'email' | 'dni' | 'whatsapp'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.clearMessages();
    this.repo.addParticipant(this.form.getRawValue(), this.newCourses()).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.created.set(user);
        this.form.reset();
        this.newCourses.set([]);
        this.showForm.set(false);
        this.refresh();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errMsg(e));
      },
    });
  }

  pick(userId: string, courseId: string): void {
    this.picked.update((p) => ({ ...p, [userId]: courseId }));
  }

  /** El repositorio impide duplicados y cursos inexistentes. */
  assign(user: User): void {
    const courseId = this.picked()[user.id];
    if (!courseId) return;
    this.clearMessages();
    this.busy.set(true);
    this.repo.enrollParticipant(user.id, courseId).subscribe({
      next: () => {
        this.busy.set(false);
        this.picked.update((p) => ({ ...p, [user.id]: '' }));
        this.message.set(`Curso «${this.courseName(courseId)}» asignado a ${user.fullName}${DEMO_SUFFIX}.`);
        this.refresh();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(`No se pudo asignar el curso: ${errMsg(e)}`);
        this.refresh();
      },
    });
  }

  askRemove(userId: string, courseId: string): void {
    this.clearMessages();
    this.confirmRemove.set(this.key(userId, courseId));
  }

  /** Solo se retira si no hay avance, intentos ni certificados (regla del repositorio). */
  remove(user: User, a: CourseAssignment): void {
    const courseId = a.enrollment.courseId;
    this.confirmRemove.set(null);
    this.clearMessages();
    this.busy.set(true);
    this.repo.unenrollParticipant(user.id, courseId).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set(`Curso «${this.courseName(courseId)}» retirado de ${user.fullName}. El participante y su historial se conservan.`);
        this.refresh();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errMsg(e));
      },
    });
  }

  private courseName(courseId: string): string {
    return this.courses().find((c) => c.id === courseId)?.name ?? courseId;
  }

  private clearMessages(): void {
    this.error.set('');
    this.message.set('');
    this.created.set(null);
  }
}
