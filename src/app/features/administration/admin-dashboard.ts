import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { User } from '../../core/models/user.model';
import { CourseRecord, Enrollment } from '../../core/models/course.model';
import { Attempt, isPendingReview } from '../../core/models/exam.model';
import { Certificate } from '../../core/models/certificate.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { Icon } from '../../shared/components/icon';
import { AdminCourseSelect } from './admin-course-select';
import { ALL_STATUSES } from './admin-utils';
import { DashboardCharts } from './dashboard-charts';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';

@Component({
  selector: 'app-admin-dashboard',
  imports: [StatusBadge, DatePipe, AdminCourseSelect, Icon, DashboardCharts],
  template: `
    <div class="stack">
      <header class="page-head">
        <h1>Dashboard</h1>
        @if (!apiMode) {
          <p class="alert alert-warning small">Cifras de demostración: se calculan con datos de prueba.</p>
        }
      </header>

      <!-- Modo API (18/11/2026): indicadores, gráficos y actividad calculados en MySQL (GET /dashboard). -->
      @if (apiMode) {
        <app-dashboard-charts />
        <h2 class="section-title">Detalle por curso</h2>
      }

      @if (courses().length) {
        <app-admin-course-select [courses]="courses()" [selected]="courseId()" allLabel="Todos los cursos" (selectedChange)="selectCourse($event)" />
      }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      } @else {
        <div class="grid stats">
          <article class="card stat">
            <app-icon name="users" />
            <span>{{ courseId() ? 'Participantes inscritos' : 'Participantes registrados' }}</span>
            <strong>{{ participantCount() }}</strong>
            @if (!courseId() && withoutCourses() > 0) {
              <small class="muted">{{ withoutCourses() }} sin cursos asignados</small>
            }
          </article>
          <article class="card stat">
            <app-icon name="list" />
            <span>Inscripciones</span>
            <strong>{{ enrollments().length }}</strong>
            <small class="muted">Un participante puede tener varios cursos.</small>
          </article>
          <article class="card stat"><app-icon name="chart" /><span>Capacitaciones en progreso</span><strong>{{ inProgress() }}</strong></article>
          <article class="card stat"><app-icon name="check-circle" /><span>Aprobaciones</span><strong>{{ approved() }}</strong></article>
          <article class="card stat"><app-icon name="award" /><span>Certificados emitidos</span><strong>{{ certificates().length }}</strong></article>
        </div>

        <div class="grid panels">
          <section class="card stack">
            <h2>Estado de las inscripciones</h2>
            @if (enrollments().length === 0) {
              <p class="muted">No hay inscripciones en este curso.</p>
            } @else {
              <ul class="status">
                @for (s of byStatus(); track s.status) {
                  <li><app-status-badge [status]="s.status" /><strong>{{ s.count }}</strong></li>
                }
              </ul>
            }
          </section>

          <section class="card stack">
            <h2>Últimos intentos</h2>
            @if (recent().length === 0) {
              <p class="muted">{{ courseId() ? 'No hay intentos registrados en este curso.' : 'Aún no hay intentos registrados.' }}</p>
            } @else {
              <div class="table-wrap table-cards">
                <table>
                  <caption class="sr-only">Últimos intentos registrados</caption>
                  <thead>
                    <tr>
                      <th scope="col">Participante</th><th scope="col">Curso</th><th scope="col">Fecha</th>
                      <th scope="col">Nota</th><th scope="col">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of recent(); track a.id) {
                      <tr [attr.data-attempt]="a.id">
                        <td data-label="Participante">{{ nameOf(a.userId) }}</td>
                        <td data-label="Curso">{{ courseName(a.courseId) }}</td>
                        <td data-label="Fecha">{{ a.date | date: 'dd/MM/yyyy HH:mm' }}</td>
                        <td data-label="Nota">{{ pending(a) ? 'Pendiente' : a.score + ' / ' + a.scaleMax }}</td>
                        <td data-label="Resultado">
                          @if (pending(a)) {
                            <span class="badge badge--warning">En revisión</span>
                          } @else {
                            <span class="badge" [class]="a.passed ? 'badge--success' : 'badge--danger'">
                              {{ a.passed ? 'Aprobado' : 'Desaprobado' }}
                            </span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .stats { grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); }
      .stat { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-4); }
      .stat app-icon {
        display: grid; place-items: center; width: 36px; height: 36px; margin-bottom: var(--space-2);
        border-radius: var(--radius-pill); background: var(--c-primary-100); color: var(--c-primary);
      }
      .stat span { color: var(--c-muted); font-size: var(--text-sm); }
      .stat strong { font-size: var(--text-2xl); color: var(--c-primary); line-height: var(--leading-tight); }
      .stat small { font-size: var(--text-xs); }
      .status { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
      .status li { display: flex; align-items: center; justify-content: space-between; }
      /* «Últimos intentos» necesita más ancho que el resumen de estados para mostrar todas sus columnas. */
      .panels { grid-template-columns: minmax(240px, 1fr) minmax(0, 2.2fr); align-items: start; }
      @media (max-width: 1100px) { .panels { grid-template-columns: minmax(0, 1fr); } }
    `,
  ],
})
export class AdminDashboard {
  /** Modo API: gráficos e indicadores del servidor y sin el aviso de cifras de demostración. */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));
  private readonly repo = inject(DataRepository);
  private readonly router = inject(Router);
  /** M5: intento con preguntas abiertas sin calificar («En revisión»). */
  readonly pending = isPendingReview;

  /** Parámetro ?curso= (vacío = todos los cursos). */
  readonly curso = input<string>();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly users = signal<User[]>([]);
  readonly courses = signal<CourseRecord[]>([]);
  private readonly allEnrollments = signal<Enrollment[]>([]);
  private readonly allAttempts = signal<Attempt[]>([]);
  private readonly allCertificates = signal<Certificate[]>([]);

  /** Curso filtrado; null = todos. Un curso inexistente en la URL se trata como «todos». */
  readonly courseId = computed(() => {
    const wanted = this.curso();
    return wanted && this.courses().some((c) => c.id === wanted) ? wanted : null;
  });
  private readonly inCourse = <T extends { courseId: string }>(list: T[]) => {
    const id = this.courseId();
    return id ? list.filter((x) => x.courseId === id) : list;
  };
  readonly enrollments = computed(() => this.inCourse(this.allEnrollments()));
  readonly attempts = computed(() => this.inCourse(this.allAttempts()));
  readonly certificates = computed(() => this.inCourse(this.allCertificates()));

  readonly participants = computed(() => this.users().filter((u) => u.role === 'participant'));
  /** Participantes únicos: todos los registrados, o los inscritos en el curso filtrado. */
  readonly participantCount = computed(() =>
    this.courseId() ? new Set(this.enrollments().map((e) => e.userId)).size : this.participants().length,
  );
  readonly withoutCourses = computed(() => {
    const enrolled = new Set(this.allEnrollments().map((e) => e.userId));
    return this.participants().filter((u) => !enrolled.has(u.id)).length;
  });
  readonly inProgress = computed(
    () => this.enrollments().filter((e) => e.status === 'en_progreso' || e.status === 'listo_examen').length,
  );
  readonly approved = computed(() => this.enrollments().filter((e) => e.status === 'aprobado').length);
  readonly byStatus = computed(() =>
    ALL_STATUSES.map((status) => ({
      status,
      count: this.enrollments().filter((e) => e.status === status).length,
    })),
  );
  readonly recent = computed(() =>
    [...this.attempts()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5),
  );

  constructor() {
    forkJoin({
      users: this.repo.getUsers(),
      courses: this.repo.getCourses(),
      enrollments: this.repo.listEnrollments(),
      attempts: this.repo.listAttempts(),
      certificates: this.repo.listCertificates(),
    }).subscribe({
      next: (r) => {
        this.users.set(r.users);
        this.courses.set(r.courses);
        this.allEnrollments.set(r.enrollments);
        this.allAttempts.set(r.attempts);
        this.allCertificates.set(r.certificates);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el dashboard.');
        this.loading.set(false);
      },
    });
  }

  selectCourse(courseId: string): void {
    this.router.navigate([], { queryParams: { curso: courseId || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  nameOf(userId: string): string {
    return this.users().find((u) => u.id === userId)?.fullName ?? '—';
  }

  courseName(courseId: string): string {
    return this.courses().find((c) => c.id === courseId)?.name ?? '—';
  }
}
