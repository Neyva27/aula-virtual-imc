import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import { AdminCompany } from '../../core/models/admin.model';
import { Icon } from '../../shared/components/icon';
import { errMsg } from './admin-utils';

/**
 * Empresas (administración general de IMC, modo API). Alta, edición (nombre, RUC y correo de contacto), activación y
 * desactivación. Desactivar no borra la empresa ni sus asociaciones; solo impide asignaciones nuevas.
 */
@Component({
  selector: 'app-admin-companies',
  imports: [ReactiveFormsModule, Icon],
  template: `
    <div class="stack">
      <header class="row between page-head">
        <div>
          <h1>Empresas</h1>
          <p class="muted">Administración general de IMC: empresas cliente y su estado.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openForm(null)">
          <app-icon name="plus" size="sm" /> Nueva empresa
        </button>
      </header>

      @if (message()) { <p class="alert alert-success" role="status" data-test="message">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert" data-test="error">{{ error() }}</p> }

      @if (showForm()) {
        <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="company-form-title">
          <h2 id="company-form-title">{{ editing() ? 'Editar empresa' : 'Nueva empresa' }}</h2>
          <div class="grid grid-3">
            <div class="field">
              <label for="c-name">Nombre</label>
              <input id="c-name" class="input" formControlName="name" [class.is-invalid]="bad('name')" />
              @if (bad('name')) { <span class="error-text">Ingresa el nombre de la empresa.</span> }
            </div>
            <div class="field">
              <label for="c-ruc">RUC</label>
              <input id="c-ruc" class="input" maxlength="11" formControlName="ruc" [class.is-invalid]="bad('ruc')" />
              @if (bad('ruc')) { <span class="error-text">El RUC debe tener 11 caracteres.</span> }
            </div>
            <div class="field">
              <label for="c-email">Correo de contacto (opcional)</label>
              <input id="c-email" class="input" type="email" formControlName="contactEmail" [class.is-invalid]="bad('contactEmail')" />
              @if (bad('contactEmail')) { <span class="error-text">Ingresa un correo válido.</span> }
            </div>
          </div>
          <div class="row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ editing() ? 'Guardar cambios' : 'Crear empresa' }}</button>
            <button type="button" class="btn btn-ghost" (click)="showForm.set(false)">Cancelar</button>
          </div>
        </form>
      }

      <div class="field search">
        <label for="company-search" class="sr-only">Buscar empresa</label>
        <input id="company-search" class="input" placeholder="Buscar por nombre o RUC" (input)="search($any($event.target).value)" />
      </div>

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (companies().length === 0) {
        <p class="card muted" data-test="empty">No hay empresas que coincidan.</p>
      } @else {
        <div class="table-wrap table-cards">
          <table>
            <caption class="sr-only">Empresas</caption>
            <thead><tr><th scope="col">Empresa</th><th scope="col">RUC</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              @for (c of companies(); track c.id) {
                <tr [attr.data-company]="c.id">
                  <td data-label="Empresa"><strong>{{ c.name }}</strong>@if (c.contactEmail) { <span class="small muted block">{{ c.contactEmail }}</span> }</td>
                  <td data-label="RUC">{{ c.ruc }}</td>
                  <td data-label="Estado">
                    <span class="badge" [class]="c.active ? 'badge--success' : 'badge--neutral'">{{ c.active ? 'Activa' : 'Desactivada' }}</span>
                  </td>
                  <td data-label="Acciones">
                    <div class="row actions">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="openForm(c)" [attr.aria-label]="'Editar ' + c.name">Editar</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(c)" [attr.aria-label]="(c.active ? 'Desactivar ' : 'Activar ') + c.name">
                        {{ c.active ? 'Desactivar' : 'Activar' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`.between { align-items: flex-start; } .search { max-width: 360px; margin-bottom: 0; } .block { display: block; } .actions { gap: 0.4rem; flex-wrap: wrap; }`],
})
export class AdminCompanies {
  private readonly api = inject(ApiDataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editing = signal<AdminCompany | null>(null);
  readonly companies = signal<AdminCompany[]>([]);
  readonly message = signal('');
  readonly error = signal('');
  private query = '';

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    ruc: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(11)]],
    contactEmail: ['', [Validators.email, Validators.maxLength(191)]],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.api.listAdminCompanies({ q: this.query }).subscribe({
      next: (list) => {
        this.companies.set(list);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.error.set(errMsg(e));
      },
    });
  }

  search(q: string): void {
    this.query = q;
    this.load();
  }

  bad(name: 'name' | 'ruc' | 'contactEmail'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  openForm(company: AdminCompany | null): void {
    this.editing.set(company);
    this.form.reset({ name: company?.name ?? '', ruc: company?.ruc ?? '', contactEmail: company?.contactEmail ?? '' });
    this.showForm.set(true);
    this.message.set('');
    this.error.set('');
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input = { name: v.name.trim(), ruc: v.ruc.trim(), contactEmail: v.contactEmail.trim() || null };
    const current = this.editing();
    this.saving.set(true);
    (current ? this.api.updateCompany(current.id, input) : this.api.createCompany(input)).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.message.set(current ? `Empresa «${c.name}» actualizada.` : `Empresa «${c.name}» creada.`);
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.error.set(errMsg(e));
      },
    });
  }

  toggle(c: AdminCompany): void {
    this.message.set('');
    this.error.set('');
    this.api.setCompanyActive(c.id, !c.active).subscribe({
      next: () => {
        this.message.set(c.active ? `Empresa «${c.name}» desactivada: no admite asignaciones nuevas.` : `Empresa «${c.name}» activada.`);
        this.load();
      },
      error: (e: unknown) => this.error.set(errMsg(e)),
    });
  }
}
