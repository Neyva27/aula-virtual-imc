import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { User } from '../../core/models/user.model';
import { Course, Enrollment } from '../../core/models/course.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { ProgressBar } from '../../shared/components/progress-bar';
import { errMsg, progressPercent } from './admin-utils';

@Component({
  selector: 'app-admin-participants',
  imports: [ReactiveFormsModule, StatusBadge, ProgressBar],
  template: `
    <div class="stack">
      <header class="row between">
        <div>
          <h1>Participantes</h1>
          <p class="muted">La empresa registra a cada participante y le entrega sus credenciales.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="toggleForm()">
          {{ showForm() ? 'Cancelar' : 'Registrar participante' }}
        </button>
      </header>

      @if (created(); as c) {
        <p class="alert alert-success" role="status">
          Participante registrado: <strong>{{ c.fullName }}</strong>. Usuario: {{ c.email }} · Contraseña de
          demostración: <strong>{{ demoPassword }}</strong>.
        </p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (showForm()) {
        <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <h2>Nuevo participante</h2>
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
          </div>
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
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Correo</th><th>Curso asignado</th><th>Progreso</th><th>Estado</th></tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.user.id) {
                <tr>
                  <td>{{ r.user.fullName }}</td>
                  <td>{{ r.user.email }}</td>
                  <td>{{ r.enrollment ? course()?.name : 'Sin curso' }}</td>
                  <td class="prog">
                    <app-progress-bar [value]="r.percent" label="Progreso del participante" />
                    <span class="small">{{ r.percent }}%</span>
                  </td>
                  <td>@if (r.enrollment; as e) { <app-status-badge [status]="e.status" /> }</td>
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
      .between { justify-content: space-between; align-items: flex-start; }
      .search { max-width: 360px; margin: 0; }
      .prog { min-width: 130px; }
    `,
  ],
})
export class AdminParticipants {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly demoPassword = DEMO_CONFIG.demoPassword;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly showForm = signal(false);
  readonly created = signal<User | null>(null);
  readonly filter = signal('');

  readonly users = signal<User[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly course = signal<Course | null>(null);

  readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    dni: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
  });

  readonly rows = computed(() => {
    const f = this.filter().trim().toLowerCase();
    return this.users()
      .filter((u) => u.role === 'participant')
      .filter((u) => !f || u.fullName.toLowerCase().includes(f) || u.email.toLowerCase().includes(f))
      .map((user) => {
        const enrollment = this.enrollments().find((e) => e.userId === user.id) ?? null;
        return { user, enrollment, percent: progressPercent(this.course(), enrollment) };
      });
  });

  constructor() {
    this.refresh();
  }

  refresh(): void {
    forkJoin({
      users: this.repo.getUsers(),
      enrollments: this.repo.getEnrollments(),
      course: this.repo.getCourse(),
    }).subscribe({
      next: (r) => {
        this.users.set(r.users);
        this.enrollments.set(r.enrollments);
        this.course.set(r.course);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  onFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.error.set('');
  }

  bad(name: 'fullName' | 'email' | 'dni'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.created.set(null);
    this.repo.addParticipant(this.form.getRawValue()).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.created.set(user);
        this.form.reset();
        this.showForm.set(false);
        this.refresh();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errMsg(e));
      },
    });
  }
}
