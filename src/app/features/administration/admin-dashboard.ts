import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { User } from '../../core/models/user.model';
import { Enrollment } from '../../core/models/course.model';
import { Attempt } from '../../core/models/exam.model';
import { Certificate } from '../../core/models/certificate.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { ALL_STATUSES } from './admin-utils';

@Component({
  selector: 'app-admin-dashboard',
  imports: [StatusBadge, DatePipe],
  template: `
    <div class="stack">
      <header>
        <h1>Dashboard</h1>
        <p class="alert alert-warning small">Cifras de demostración: se calculan con datos de prueba.</p>
      </header>

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      } @else {
        <div class="grid grid-3">
          <article class="card stat"><span>Participantes registrados</span><strong>{{ participants().length }}</strong></article>
          <article class="card stat"><span>Capacitaciones en progreso</span><strong>{{ inProgress() }}</strong></article>
          <article class="card stat"><span>Aprobaciones</span><strong>{{ approved() }}</strong></article>
          <article class="card stat"><span>Certificados emitidos</span><strong>{{ certificates().length }}</strong></article>
        </div>

        <div class="grid grid-2">
          <section class="card stack">
            <h2>Estado de los participantes</h2>
            <ul class="status">
              @for (s of byStatus(); track s.status) {
                <li><app-status-badge [status]="s.status" /><strong>{{ s.count }}</strong></li>
              }
            </ul>
          </section>

          <section class="card stack">
            <h2>Últimos intentos</h2>
            @if (recent().length === 0) {
              <p class="muted">Aún no hay intentos registrados.</p>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Participante</th><th>Fecha</th><th>Nota</th><th>Resultado</th></tr></thead>
                  <tbody>
                    @for (a of recent(); track a.id) {
                      <tr>
                        <td>{{ nameOf(a.userId) }}</td>
                        <td>{{ a.date | date: 'dd/MM/yyyy HH:mm' }}</td>
                        <td>{{ a.score }}</td>
                        <td>
                          <span class="badge" [class]="a.passed ? 'badge--success' : 'badge--danger'">
                            {{ a.passed ? 'Aprobado' : 'Desaprobado' }}
                          </span>
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
      .stat { display: flex; flex-direction: column; gap: 0.25rem; }
      .stat span { color: var(--c-muted); font-size: 0.9rem; }
      .stat strong { font-size: 2.2rem; color: var(--c-primary); line-height: 1.1; }
      .status { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
      .status li { display: flex; align-items: center; justify-content: space-between; }
    `,
  ],
})
export class AdminDashboard {
  private readonly repo = inject(DataRepository);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly users = signal<User[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly attempts = signal<Attempt[]>([]);
  readonly certificates = signal<Certificate[]>([]);

  readonly participants = computed(() => this.users().filter((u) => u.role === 'participant'));
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
      enrollments: this.repo.getEnrollments(),
      attempts: this.repo.getAttempts(),
      certificates: this.repo.getCertificates(),
    }).subscribe({
      next: (r) => {
        this.users.set(r.users);
        this.enrollments.set(r.enrollments);
        this.attempts.set(r.attempts);
        this.certificates.set(r.certificates);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el dashboard.');
        this.loading.set(false);
      },
    });
  }

  nameOf(userId: string): string {
    return this.users().find((u) => u.id === userId)?.fullName ?? '—';
  }
}
