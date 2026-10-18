import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { User } from '../../core/models/user.model';
import { Course, Enrollment } from '../../core/models/course.model';
import { Attempt, ExamConfig } from '../../core/models/exam.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { errMsg, progressPercent } from './admin-utils';

@Component({
  selector: 'app-admin-results',
  imports: [DatePipe, StatusBadge],
  template: `
    <div class="stack">
      <header>
        <h1>Seguimiento y resultados</h1>
        <p class="muted">Avance de cada participante, intentos registrados y notas.</p>
      </header>

      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else {
        <section class="stack">
          <h2>Estado por participante</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Participante</th><th>Avance</th><th>Estado</th><th>Intentos</th><th>Última nota</th></tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.user.id) {
                  <tr>
                    <td>{{ r.user.fullName }}</td>
                    <td>{{ r.percent }}%</td>
                    <td>@if (r.enrollment; as e) { <app-status-badge [status]="e.status" /> }</td>
                    <td>{{ r.attempts }} de {{ exam()?.maxAttempts }}</td>
                    <td>{{ r.lastScore === null ? '—' : r.lastScore + ' / ' + exam()?.scaleMax }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="stack">
          <h2>Historial de intentos</h2>
          @if (history().length === 0) {
            <p class="card muted">Aún no hay intentos registrados.</p>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Participante</th><th>Nota</th><th>Correctas</th><th>Duración</th><th>Resultado</th></tr>
                </thead>
                <tbody>
                  @for (a of history(); track a.id) {
                    <tr>
                      <td>{{ a.date | date: 'dd/MM/yyyy HH:mm' }}</td>
                      <td>{{ nameOf(a.userId) }}</td>
                      <td>{{ a.score }}</td>
                      <td>{{ a.correctCount }} de {{ a.totalQuestions }}</td>
                      <td>{{ duration(a.durationSec) }}</td>
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
        <p class="small muted">Datos de demostración. No incluye reportes avanzados en esta primera versión.</p>
      }
    </div>
  `,
})
export class AdminResults {
  private readonly repo = inject(DataRepository);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly users = signal<User[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly attempts = signal<Attempt[]>([]);
  readonly course = signal<Course | null>(null);
  readonly exam = signal<ExamConfig | null>(null);

  readonly history = computed(() =>
    [...this.attempts()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  );

  readonly rows = computed(() =>
    this.users()
      .filter((u) => u.role === 'participant')
      .map((user) => {
        const enrollment = this.enrollments().find((e) => e.userId === user.id) ?? null;
        const mine = this.history().filter((a) => a.userId === user.id);
        return {
          user,
          enrollment,
          percent: progressPercent(this.course(), enrollment),
          attempts: mine.length,
          lastScore: mine.length ? mine[0].score : null,
        };
      }),
  );

  constructor() {
    forkJoin({
      users: this.repo.getUsers(),
      enrollments: this.repo.getEnrollments(),
      attempts: this.repo.getAttempts(),
      course: this.repo.getCourse(),
      exam: this.repo.getExamConfig(),
    }).subscribe({
      next: (r) => {
        this.users.set(r.users);
        this.enrollments.set(r.enrollments);
        this.attempts.set(r.attempts);
        this.course.set(r.course);
        this.exam.set(r.exam);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  nameOf(userId: string): string {
    return this.users().find((u) => u.id === userId)?.fullName ?? '—';
  }

  duration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
  }
}
