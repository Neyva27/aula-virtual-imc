import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import {
  ActivationSummary,
  STUDENT_PAGE_SIZE,
  Student,
  StudentCompany,
  StudentPage,
  StudentQuery,
  RegisterStudentResult,
  ActivationStatus,
  WHATSAPP_ERROR,
  cleanWhatsapp,
  isValidWhatsapp,
} from '../../core/models/student.model';
import { Icon } from '../../shared/components/icon';
import { StatusBadge } from '../../shared/components/status-badge';
import { CourseRecord, Enrollment } from '../../core/models/course.model';
import { errMsg } from './admin-utils';

/** Tiempo de espera de la búsqueda mientras se escribe (evita una solicitud por tecla). */
export const SEARCH_DEBOUNCE_MS = 300;

/** Mensaje del resultado del correo de activación, tal como lo informa el servidor (nunca se simula un envío). */
/** Aviso sobre la empresa indicada por razón social y RUC (20/11/2026). */
export function companyNoteOf(r: RegisterStudentResult, company: { name: string; ruc: string } | undefined): string {
  if (!company || !r.companyOutcome) return '';
  const saved = r.student.companies.find((c) => c.ruc === company.ruc);
  const label = saved ? `«${saved.name}» (RUC ${saved.ruc})` : `RUC ${company.ruc}`;
  return r.companyOutcome === 'CREATED'
    ? `Se registró la empresa ${label} y se asoció al participante.`
    : `El RUC ya estaba registrado: se asoció al participante la empresa existente ${label}.`;
}

export function deliveryMessage(email: string, activation: ActivationSummary): { kind: 'success' | 'warning'; text: string } {
  const expires = new Date(activation.expiresAt).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });
  switch (activation.emailDelivery) {
    case 'SENT':
      return { kind: 'success', text: `Se envió el enlace de activación a ${email}. El enlace vence el ${expires}.` };
    case 'FAILED':
      return {
        kind: 'warning',
        text: 'No se pudo enviar el correo de activación. La cuenta queda pendiente: puedes reenviar el enlace más tarde.',
      };
    case 'NOT_CONFIGURED':
      return {
        kind: 'warning',
        text:
          'El servidor todavía no tiene configurado el envío de correos: NO se envió ningún enlace. La cuenta queda ' +
          'pendiente de activación hasta que se configure el correo y se reenvíe el enlace.',
      };
    case 'DEV_CONSOLE':
      return {
        kind: 'warning',
        text:
          `Modo de desarrollo: NO se envió ningún correo. El enlace de activación de ${email} se escribió en la consola ` +
          `del servidor (backend) y vence el ${expires}. Cópialo y ábrelo en el navegador para activar la cuenta.`,
      };
  }
}

type FormField = 'firstNames' | 'lastNames' | 'email' | 'dni' | 'whatsapp';
const whatsappValidator = (c: AbstractControl): ValidationErrors | null => (isValidWhatsapp(String(c.value ?? '')) ? null : { whatsapp: true });

/**
 * Participantes en MODO API (rol Instructor). Todos los datos salen del servidor (NestJS, módulo `students`):
 * listado con búsqueda, filtro por empresa y paginación; detalle; registro (empresas propias y activas OPCIONALES desde
 * el 17/11/2026); reenvío del enlace de activación. Cada Instructor ve solo a los participantes que registró (regla del
 * servidor). Si una solicitud falla se muestra el error: nunca se recurre a datos de demostración.
 * No matricula en cursos (fase posterior). La pantalla de la demostración (`AdminParticipants`) se conserva.
 */
/** Minúsculas y sin tildes, para buscar «Construcción» con «construccion». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Component({
  selector: 'app-admin-students-api',
  imports: [ReactiveFormsModule, Icon, StatusBadge],
  template: `
    <div class="stack">
      <header class="row between page-head">
        <div>
          <h1>Participantes</h1>
          <p class="muted">Participantes que registraste en la plataforma. Solo tú puedes verlos.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="toggleForm()">
          <app-icon [name]="showForm() ? 'x' : 'plus'" size="sm" />
          {{ showForm() ? 'Cancelar' : 'Registrar participante' }}
        </button>
      </header>

      @if (companiesError()) {
        <div class="alert alert-warning row between" role="alert" data-test="companies-error">
          <span>No se pudieron cargar las empresas: {{ companiesError() }} Puedes registrar participantes sin empresa o con una empresa nueva.</span>
          <button type="button" class="btn btn-secondary btn-sm" (click)="retryCompanies()">Reintentar</button>
        </div>
      }

      @if (registered(); as r) {
        <div class="alert alert-success" role="status" data-test="registered">
          <p>
            Participante registrado: <strong>{{ r.fullName }}</strong> ({{ r.email }}). La cuenta queda
            <strong>pendiente de activación</strong>: el participante creará su propia contraseña con el enlace de activación.
          </p>
          @if (companyNote()) { <p data-test="company-note">{{ companyNote() }}</p> }
        </div>
      }
      @if (delivery(); as d) {
        <p class="alert" [class.alert-success]="d.kind === 'success'" [class.alert-warning]="d.kind === 'warning'" role="status" data-test="delivery">
          {{ d.text }}
        </p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert" data-test="error">{{ error() }}</p>
      }
      @if (whatsappPrepared(); as w) {
        <div class="alert alert-info" role="status" data-test="whatsapp-prepared">
          <p>Enlace generado para <strong>{{ w.name }}</strong>. {{ w.opened ? 'Se abrió WhatsApp: revisa el mensaje y pulsa enviar.' : 'El navegador no abrió WhatsApp.' }} El mensaje no se envía de forma automática.</p>
          <a class="btn btn-secondary btn-sm" [href]="w.url" target="_blank" rel="noopener noreferrer" (click)="confirmOpened(w.id)">Abrir WhatsApp</a>
        </div>
      }

      @if (showForm()) {
        <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="new-participant-title">
          <h2 id="new-participant-title">Nuevo participante</h2>
          <div class="grid grid-3">
            <div class="field">
              <label for="p-first">Nombres</label>
              <input id="p-first" class="input" formControlName="firstNames" autocomplete="off" [class.is-invalid]="bad('firstNames')" />
              @if (bad('firstNames')) { <span class="error-text">Ingresa los nombres (al menos 2 caracteres).</span> }
            </div>
            <div class="field">
              <label for="p-last">Apellidos</label>
              <input id="p-last" class="input" formControlName="lastNames" autocomplete="off" [class.is-invalid]="bad('lastNames')" />
              @if (bad('lastNames')) { <span class="error-text">Ingresa los apellidos (al menos 2 caracteres).</span> }
            </div>
            <div class="field">
              <label for="p-email">Correo electrónico</label>
              <input id="p-email" class="input" type="email" formControlName="email" autocomplete="off" [class.is-invalid]="bad('email')" />
              @if (bad('email')) { <span class="error-text">Ingresa un correo válido.</span> }
            </div>
            <div class="field">
              <label for="p-dni">DNI</label>
              <input id="p-dni" class="input" inputmode="numeric" maxlength="8" formControlName="dni" autocomplete="off" [class.is-invalid]="bad('dni')" />
              @if (bad('dni')) { <span class="error-text">El DNI debe tener 8 dígitos.</span> }
            </div>
            <div class="field">
              <label for="p-whatsapp">Número de WhatsApp (opcional)</label>
              <input id="p-whatsapp" class="input" type="tel" inputmode="tel" maxlength="24" placeholder="987654321 o +51987654321" formControlName="whatsapp" autocomplete="off" [class.is-invalid]="bad('whatsapp')" />
              @if (bad('whatsapp')) { <span class="error-text">{{ whatsappError }}</span> }
            </div>
          </div>
          <fieldset class="field companies-field" aria-describedby="companies-help">
            <legend>Empresa del participante (opcional)</legend>
            <div class="row company-modes" role="radiogroup" aria-label="Empresa del participante">
              <label class="check"><input type="radio" name="companyMode" value="none" [checked]="companyMode() === 'none'" (change)="setCompanyMode('none')" /> Sin empresa</label>
              <label class="check"><input type="radio" name="companyMode" value="existing" [checked]="companyMode() === 'existing'" (change)="setCompanyMode('existing')" /> Empresa registrada</label>
              <label class="check"><input type="radio" name="companyMode" value="new" [checked]="companyMode() === 'new'" (change)="setCompanyMode('new')" /> Empresa nueva (razón social y RUC)</label>
            </div>

            @if (companyMode() === 'existing') {
              @if (selectedCompanies().length) {
                <ul class="chips" aria-label="Empresas elegidas" data-test="selected-companies">
                  @for (c of selectedCompanies(); track c.id) {
                    <li class="chip">
                      {{ c.name }} <span class="small muted">RUC {{ c.ruc }}</span>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="toggleCompany(c.id)" [attr.aria-label]="'Quitar ' + c.name">
                        <app-icon name="x" size="sm" />
                      </button>
                    </li>
                  }
                </ul>
              }
              @if (activeCompanies().length > 0) {
                <label for="company-search" class="sr-only">Buscar empresa por razón social o RUC</label>
                <input id="company-search" class="input" type="search" placeholder="Buscar empresa por razón social o RUC"
                  autocomplete="off" [value]="companySearch()" (input)="companySearch.set($any($event.target).value)" />
                <div class="company-list" role="group" aria-label="Empresas activas">
                  @for (c of filteredCompanies(); track c.id) {
                    <label class="check" [attr.data-company]="c.id">
                      <input type="checkbox" [checked]="selected().includes(c.id)" [disabled]="!c.active" (change)="toggleCompany(c.id)" />
                      <span>{{ c.name }} <span class="small muted">RUC {{ c.ruc }}</span></span>
                    </label>
                  } @empty {
                    <span class="small muted" data-test="no-company-match">Ninguna empresa activa coincide con «{{ companySearch() }}».</span>
                  }
                </div>
              } @else if (companiesLoaded()) {
                <span class="small muted" data-test="no-active-companies">No hay empresas activas registradas: elige «Empresa nueva» o registra al participante sin empresa.</span>
              }
            }

            @if (companyMode() === 'new') {
              <div class="grid grid-2">
                <div class="field">
                  <label for="p-company-name">Razón social o nombre de la empresa</label>
                  <input id="p-company-name" class="input" maxlength="150" autocomplete="off" [value]="newCompanyName()"
                    (input)="newCompanyName.set($any($event.target).value)" [class.is-invalid]="badNewCompanyName()" />
                  @if (badNewCompanyName()) { <span class="error-text">Ingresa la razón social de la empresa.</span> }
                </div>
                <div class="field">
                  <label for="p-company-ruc">RUC</label>
                  <input id="p-company-ruc" class="input" inputmode="numeric" maxlength="11" autocomplete="off" [value]="newCompanyRuc()"
                    (input)="newCompanyRuc.set($any($event.target).value)" [class.is-invalid]="badNewCompanyRuc()" />
                  @if (badNewCompanyRuc()) { <span class="error-text">El RUC debe tener 11 dígitos.</span> }
                </div>
              </div>
              @if (rucMatch(); as m) {
                <span class="small" data-test="ruc-match">Ya existe una empresa con ese RUC: <strong>{{ m.name }}</strong>. Se usará esa empresa (no se duplica).</span>
              }
            }
            <span id="companies-help" class="small muted">
              Opcional. Si el RUC ya está registrado se reutiliza esa empresa; si no existe, se registra. Una empresa desactivada no admite participantes nuevos.
            </span>
          </fieldset>
          <button type="submit" class="btn btn-primary" [class.is-loading]="saving()" [disabled]="saving()">Registrar</button>
          <p class="small muted">
            No se genera ninguna contraseña: el participante recibe un enlace para activar su cuenta y crear la suya.
            El registro no lo matricula en cursos.
          </p>
        </form>
      }

      <div class="row filters">
        <div class="field search">
          <label for="filter" class="sr-only">Buscar participante</label>
          <input id="filter" class="input" placeholder="Buscar por nombre, DNI, correo, empresa o RUC" (input)="onSearch($event)" />
        </div>
        @if (companies().length > 1) {
          <div class="field company-filter">
            <label for="company-filter" class="sr-only">Filtrar por empresa</label>
            <select id="company-filter" class="input" (change)="onCompany($any($event.target).value)">
              <option value="">Todas las empresas</option>
              @for (c of companies(); track c.id) {
                <option [value]="c.id" [selected]="query().companyId === c.id">{{ c.name }}</option>
              }
            </select>
          </div>
        }
      </div>

      @if (detail(); as s) {
        <section class="card stack detail" aria-labelledby="detail-title" data-test="detail">
          <div class="row between">
            <h2 id="detail-title">{{ s.fullName }}</h2>
            <button type="button" class="btn btn-ghost btn-sm" (click)="detail.set(null)">Cerrar</button>
          </div>
          <dl class="detail-list">
            <dt>Nombres</dt><dd>{{ s.firstNames }}</dd>
            <dt>Apellidos</dt><dd>{{ s.lastNames }}</dd>
            <dt>Correo</dt><dd>{{ s.email }}</dd>
            <dt>DNI</dt><dd>{{ s.dni }}</dd>
            <dt>WhatsApp</dt>
            <dd>
              <form class="row contact" (submit)="$event.preventDefault(); saveWhatsapp(s)" novalidate>
                <label class="sr-only" for="detail-whatsapp">Número de WhatsApp de {{ s.fullName }}</label>
                <input id="detail-whatsapp" class="input" type="tel" inputmode="tel" maxlength="24" placeholder="No registrado" autocomplete="off"
                  [value]="whatsappDraft()" (input)="whatsappDraft.set($any($event.target).value); whatsappMessage.set('')" [class.is-invalid]="whatsappInvalid()" />
                <button type="submit" class="btn btn-secondary btn-sm" [disabled]="busy() || whatsappInvalid()" data-test="save-whatsapp">Guardar</button>
              </form>
              @if (whatsappInvalid()) { <span class="error-text">{{ whatsappError }}</span> }
              @if (whatsappMessage()) { <span class="small muted" role="status" data-test="whatsapp-message">{{ whatsappMessage() }}</span> }
            </dd>
            <dt>Cuenta</dt><dd>{{ s.active ? 'Habilitada' : 'Desactivada' }}{{ s.activationPending ? ' · pendiente de activación' : '' }}</dd>
            @if (s.activationPending) {
              <dt>Activación</dt>
              <dd data-test="activation-status">
                @if (activation(); as a) {
                  <span class="block">Enlace: {{ linkLabel(a) }}@if (a.expiresAt && a.linkState === 'VIGENTE') { · vence {{ limaTime(a.expiresAt) }} }</span>
                  @if (a.linkGeneratedAt) { <span class="small muted block">Enlace para WhatsApp generado: {{ limaTime(a.linkGeneratedAt) }}</span> }
                  @if (a.whatsappOpenedAt) { <span class="small muted block">WhatsApp abierto para envío manual: {{ limaTime(a.whatsappOpenedAt) }}</span> }
                }
                <span class="small muted block">La plataforma no puede confirmar si el mensaje se envió o se entregó.</span>
              </dd>
            }
            <dt>Empresas</dt>
            <dd>
              @for (c of s.companies; track c.id) {
                <span class="block">{{ c.name }} <span class="small muted">RUC {{ c.ruc }}</span>
                  @if (!c.active) { <span class="badge badge--warning">Desactivada</span> }</span>
              } @empty {
                <span class="muted">Sin empresa</span>
              }
            </dd>
          </dl>
        </section>
      }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (listError()) {
        <p class="card alert alert-danger" role="alert" data-test="list-error">No se pudo cargar el listado: {{ listError() }}</p>
      } @else if (page().items.length === 0) {
        <p class="card muted" data-test="empty">
          {{ query().q || query().companyId ? 'No hay participantes que coincidan.' : 'Todavía no has registrado participantes.' }}
        </p>
      } @else {
        <div class="table-wrap table-cards">
          <table>
            <caption class="sr-only">Participantes que registraste</caption>
            <thead>
              <tr><th scope="col">Participante</th><th scope="col">DNI</th><th scope="col">Empresa y RUC</th><th scope="col">Cursos asignados</th><th scope="col">Acciones</th></tr>
            </thead>
            <tbody>
              @for (s of page().items; track s.id) {
                <tr [attr.data-student]="s.id">
                  <td data-label="Participante">
                    <strong>{{ s.fullName }}</strong>
                    @if (!s.active) { <span class="badge badge--neutral">Desactivada</span> }
                    <span class="small muted block">{{ s.email }}</span>
                    @if (s.whatsapp) { <span class="small muted block" data-test="whatsapp">WhatsApp: {{ s.whatsapp }}</span> }
                  </td>
                  <td data-label="DNI">{{ s.dni }}</td>
                  <td data-label="Empresa y RUC">
                    @for (c of s.companies; track c.id) {
                      <span class="block">{{ c.name }}@if (!c.active) { <span class="badge badge--warning">Desactivada</span> }</span>
                      <span class="small muted block">RUC {{ c.ruc }}</span>
                    } @empty {
                      <span class="muted small">Sin empresa</span>
                    }
                  </td>
                  <td data-label="Cursos asignados" class="assign">
                    <ul class="assignments">
                      @for (e of enrollmentsOf(s.id); track e.courseId) {
                        <li [attr.data-course]="e.courseId">
                          <span class="course-name">{{ courseName(e.courseId) }}</span>
                          <app-status-badge [status]="e.status" />
                          @if (e.status === 'pendiente' && e.completedVideoIds.length === 0) {
                            <button type="button" class="btn btn-ghost btn-sm is-danger" [disabled]="busy()" (click)="removeCourse(s, e.courseId)"
                              [attr.aria-label]="'Retirar ' + courseName(e.courseId) + ' de ' + s.fullName">Retirar</button>
                          }
                        </li>
                      } @empty {
                        <li class="muted small">Sin cursos asignados</li>
                      }
                    </ul>
                    @if (availableFor(s.id).length) {
                      <div class="row assign-row">
                        <label class="sr-only" [for]="'assign-' + s.id">Curso para asignar a {{ s.fullName }}</label>
                        <select class="input" [id]="'assign-' + s.id" (change)="pick(s.id, $any($event.target).value)">
                          <option value="" [selected]="!picked()[s.id]">Elige un curso…</option>
                          @for (c of availableFor(s.id); track c.id) {
                            <option [value]="c.id" [selected]="picked()[s.id] === c.id">{{ c.name }}{{ c.status === 'borrador' ? ' (borrador)' : '' }}</option>
                          }
                        </select>
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="!picked()[s.id] || busy()" (click)="assignCourse(s)">Asignar</button>
                      </div>
                    }
                  </td>
                  <td data-label="Acciones">
                    <div class="row actions">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="openDetail(s)" [attr.aria-label]="'Ver detalle de ' + s.fullName">
                        Ver detalle
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="resend(s)"
                        [attr.aria-label]="'Reenviar enlace de activación a ' + s.fullName">
                        Reenviar enlace
                      </button>
                      @if (s.activationPending && s.active) {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy() || !s.whatsapp" (click)="sendWhatsapp(s)" data-test="send-whatsapp"
                          [attr.title]="s.whatsapp ? null : 'Registra su número de WhatsApp en «Ver detalle»'"
                          [attr.aria-label]="'Enviar enlace por WhatsApp a ' + s.fullName">
                          Enviar enlace por WhatsApp
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <nav class="row pager" aria-label="Paginación de participantes">
          <span class="small muted" data-test="range">Mostrando {{ range().from }}–{{ range().to }} de {{ page().total }}</span>
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="page().page <= 1" (click)="goTo(page().page - 1)">Anterior</button>
          <span class="small" data-test="page">Página {{ page().page }} de {{ pageCount() }}</span>
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="page().page >= pageCount()" (click)="goTo(page().page + 1)">Siguiente</button>
        </nav>
      }
    </div>
  `,
  styles: [
    `
      .between { align-items: flex-start; }
      .filters { gap: 0.75rem; align-items: flex-end; }
      .search { max-width: 360px; margin-bottom: 0; flex: 1 1 240px; }
      .company-filter { max-width: 280px; margin-bottom: 0; flex: 1 1 200px; }
      .block { display: block; }
      .companies-field { border: 0; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.4rem; min-width: 0; }
      .companies-field legend { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.35rem; }
      .check { display: flex; align-items: flex-start; gap: 0.5rem; }
      .company-list { display: grid; gap: 0.4rem; max-height: 16rem; overflow-y: auto; padding: 0.25rem 0; }
      .company-modes { gap: 0.25rem 1rem; flex-wrap: wrap; }
      .between { justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.35rem; }
      .chip { display: inline-flex; align-items: center; gap: 0.15rem; padding: 0.1rem 0.15rem 0.1rem 0.6rem; border-radius: 999px; background: var(--c-primary-100); font-size: 0.875rem; }
      .check input { flex: none; margin-top: 0.25rem; }
      .actions { gap: 0.4rem; flex-wrap: wrap; }
      .pager { gap: 0.6rem; align-items: center; flex-wrap: wrap; }
      .assignments { list-style: none; margin: 0 0 0.4rem; padding: 0; display: grid; gap: 0.35rem; }
      .assignments li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
      .course-name { font-weight: 600; }
      .assign { min-width: 240px; }
      .assign-row { flex-wrap: nowrap; gap: 0.4rem; }
      .assign-row .input { min-width: 0; flex: 1; }
      @media (max-width: 700px) { .assign { min-width: 0; } .assign-row { flex-wrap: wrap; } }
      .detail-list { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1rem; margin: 0; }
      .detail-list dt { font-weight: 600; }
      .detail-list dd { margin: 0; }
      .contact { gap: 0.4rem; flex-wrap: nowrap; max-width: 320px; }
      .contact .input { min-width: 0; }
    `,
  ],
})
export class AdminStudentsApi {
  private readonly api = inject(ApiDataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busy = signal(false);
  readonly showForm = signal(false);
  readonly error = signal('');
  readonly listError = signal('');
  readonly companiesError = signal('');
  readonly companiesLoaded = signal(false);
  readonly registered = signal<Student | null>(null);
  readonly delivery = signal<{ kind: 'success' | 'warning'; text: string } | null>(null);
  readonly detail = signal<Student | null>(null);
  /** Cursos del Instructor y matrículas de sus participantes (asignación de cursos, 18/11/2026). */
  readonly courses = signal<CourseRecord[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly picked = signal<Record<string, string>>({});

  readonly companies = signal<StudentCompany[]>([]);
  readonly selected = signal<string[]>([]);
  readonly submitted = signal(false);
  readonly query = signal<StudentQuery>({ page: 1, pageSize: STUDENT_PAGE_SIZE });
  readonly page = signal<StudentPage>({ items: [], total: 0, page: 1, pageSize: STUDENT_PAGE_SIZE });

  readonly activeCompanies = computed(() => this.companies().filter((c) => c.active));
  /** Búsqueda de empresas por razón social o RUC (opción A, 20/11/2026), sin distinguir mayúsculas ni tildes. */
  readonly companySearch = signal('');
  readonly filteredCompanies = computed(() => {
    const q = fold(this.companySearch().trim());
    const list = this.activeCompanies();
    return q ? list.filter((c) => fold(c.name).includes(q) || c.ruc.includes(q)) : list;
  });
  readonly selectedCompanies = computed(() => this.companies().filter((c) => this.selected().includes(c.id)));
  /** Empresa del participante (20/11/2026): sin empresa, una o varias registradas, o una nueva por razón social y RUC. */
  readonly companyMode = signal<'none' | 'existing' | 'new'>('none');
  readonly newCompanyName = signal('');
  readonly newCompanyRuc = signal('');
  readonly companyNote = signal('');
  /** Empresa activa ya registrada con el RUC escrito (el servidor la reutilizará). */
  readonly rucMatch = computed(() => {
    const ruc = this.newCompanyRuc().trim();
    return /^\d{11}$/.test(ruc) ? (this.activeCompanies().find((c) => c.ruc === ruc) ?? null) : null;
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.page().total / this.page().pageSize)));
  readonly range = computed(() => {
    const p = this.page();
    const from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
    return { from, to: Math.min(p.total, from + p.items.length - 1) };
  });

  readonly form = this.fb.group({
    firstNames: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    lastNames: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(191)]],
    dni: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
    whatsapp: ['', [whatsappValidator]],
  });

  readonly whatsappError = WHATSAPP_ERROR;
  readonly activation = signal<ActivationStatus | null>(null);
  readonly whatsappPrepared = signal<{ id: string; name: string; url: string; opened: boolean } | null>(null);
  readonly whatsappDraft = signal('');
  readonly whatsappMessage = signal('');
  readonly whatsappInvalid = computed(() => !isValidWhatsapp(this.whatsappDraft()));

  /** Cada consulta del listado; switchMap descarta las respuestas de consultas anteriores. */
  private readonly load$ = new Subject<StudentQuery>();
  private readonly search$ = new Subject<string>();

  constructor() {
    this.load$
      .pipe(
        switchMap((q) =>
          this.api.listStudents(q).pipe(
            map((page) => ({ page, error: '' })),
            catchError((e: unknown) => of({ page: null, error: errMsg(e) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ page, error }) => {
        this.loading.set(false);
        this.listError.set(error);
        // Si falla, la tabla queda vacía: nunca se muestran datos de otra fuente.
        this.page.set(page ?? { items: [], total: 0, page: 1, pageSize: STUDENT_PAGE_SIZE });
      });

    this.search$
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => this.reload({ ...this.query(), q: q.trim() || undefined, page: 1 }));

    this.loadCompanies();
    this.loadCourses();
    this.reload(this.query());
  }

  private reload(q: StudentQuery): void {
    this.query.set(q);
    this.loading.set(true);
    this.load$.next(q);
  }

  /** Cursos propios y matrículas: si fallan, se informa y la asignación no se muestra (sin datos de otra fuente). */
  private loadCourses(): void {
    this.api.getCourses().subscribe({ next: (list) => this.courses.set(list), error: (e: unknown) => this.error.set(`No se pudieron cargar tus cursos: ${errMsg(e)}`) });
    this.loadEnrollments();
  }

  private loadEnrollments(): void {
    this.api.listEnrollments().subscribe({ next: (list) => this.enrollments.set(list), error: (e: unknown) => this.error.set(errMsg(e)) });
  }

  enrollmentsOf(studentId: string): Enrollment[] {
    return this.enrollments().filter((e) => e.userId === studentId);
  }

  /** Cursos activos todavía no asignados al participante. */
  availableFor(studentId: string): CourseRecord[] {
    const assigned = new Set(this.enrollmentsOf(studentId).map((e) => e.courseId));
    return this.courses().filter((c) => !assigned.has(c.id) && (c as CourseRecord & { active?: boolean }).active !== false);
  }

  courseName(courseId: string): string {
    return this.courses().find((c) => c.id === courseId)?.name ?? 'Curso';
  }

  pick(studentId: string, courseId: string): void {
    this.picked.update((p) => ({ ...p, [studentId]: courseId }));
  }

  assignCourse(s: Student): void {
    const courseId = this.picked()[s.id];
    if (!courseId) return;
    this.clearMessages();
    this.busy.set(true);
    this.api.enrollParticipant(s.id, courseId).subscribe({
      next: () => {
        this.busy.set(false);
        this.picked.update((p) => ({ ...p, [s.id]: '' }));
        this.delivery.set({ kind: 'success', text: `Curso «${this.courseName(courseId)}» asignado a ${s.fullName}.` });
        this.loadEnrollments();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(`No se pudo asignar el curso: ${errMsg(e)}`);
      },
    });
  }

  removeCourse(s: Student, courseId: string): void {
    this.clearMessages();
    this.busy.set(true);
    this.api.unenrollParticipant(s.id, courseId).subscribe({
      next: () => {
        this.busy.set(false);
        this.delivery.set({ kind: 'success', text: `Curso «${this.courseName(courseId)}» retirado de ${s.fullName}. El participante se conserva.` });
        this.loadEnrollments();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(`No se pudo retirar el curso: ${errMsg(e)}`);
      },
    });
  }

  private loadCompanies(): void {
    this.api.listInstructorCompanies().subscribe({
      next: (list) => {
        this.companies.set(list);
        this.companiesLoaded.set(true);
      },
      error: (e: unknown) => this.companiesError.set(errMsg(e)),
    });
  }

  onSearch(event: Event): void {
    this.search$.next((event.target as HTMLInputElement).value);
  }

  onCompany(companyId: string): void {
    this.reload({ ...this.query(), companyId: companyId || undefined, page: 1 });
  }

  goTo(page: number): void {
    if (page < 1 || page > this.pageCount()) return;
    this.reload({ ...this.query(), page });
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.clearMessages();
    this.form.reset();
    this.resetCompanyFields();
    this.submitted.set(false);
  }

  setCompanyMode(mode: 'none' | 'existing' | 'new'): void {
    this.companyMode.set(mode);
  }

  badNewCompanyName(): boolean {
    return this.companyMode() === 'new' && this.submitted() && this.newCompanyName().trim().length < 2;
  }

  badNewCompanyRuc(): boolean {
    return this.companyMode() === 'new' && this.submitted() && !/^\d{11}$/.test(this.newCompanyRuc().trim());
  }

  retryCompanies(): void {
    this.companiesError.set('');
    this.loadCompanies();
  }

  private resetCompanyFields(): void {
    this.selected.set([]);
    this.companySearch.set('');
    this.companyMode.set('none');
    this.newCompanyName.set('');
    this.newCompanyRuc.set('');
  }

  toggleCompany(id: string): void {
    const company = this.companies().find((c) => c.id === id);
    if (!company?.active) return; // ajena o desactivada: no se puede elegir
    this.selected.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  bad(name: FormField): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.badNewCompanyName() || this.badNewCompanyRuc()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    // Empresas opcionales (17/11/2026). Solo activas, aunque la selección se hubiera alterado (opción A: cualquier empresa activa).
    const mode = this.companyMode();
    const active = new Set(this.activeCompanies().map((c) => c.id));
    const companyIds = mode === 'existing' ? this.selected().filter((id) => active.has(id)) : [];
    const company = mode === 'new' ? { name: this.newCompanyName().trim().replace(/\s+/g, ' '), ruc: this.newCompanyRuc().trim() } : undefined;

    this.saving.set(true);
    this.clearMessages();
    this.api
      .registerStudent({
        firstNames: v.firstNames.trim(),
        lastNames: v.lastNames.trim(),
        email: v.email.trim(),
        dni: v.dni.trim(),
        ...(v.whatsapp.trim() ? { whatsapp: cleanWhatsapp(v.whatsapp) } : {}),
        companyIds,
        ...(company ? { company } : {}),
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.registered.set(r.student);
          this.delivery.set(deliveryMessage(r.student.email, r.activation));
          this.companyNote.set(companyNoteOf(r, company));
          if (r.companyOutcome === 'CREATED') this.loadCompanies(); // la empresa nueva ya se puede elegir en el buscador
          this.form.reset();
          this.resetCompanyFields();
          this.submitted.set(false);
          this.showForm.set(false);
          this.reload(this.query());
        },
        error: (e: unknown) => {
          // Los datos ingresados se conservan para corregirlos.
          this.saving.set(false);
          this.error.set(`No se pudo registrar al participante: ${errMsg(e)}`);
        },
      });
  }

  openDetail(s: Student): void {
    this.clearMessages();
    this.api.getStudent(s.id).subscribe({
      next: (student) => {
        this.detail.set(student);
        this.whatsappDraft.set(student.whatsapp ?? '');
        this.whatsappMessage.set('');
        this.loadActivation(student);
      },
      error: (e: unknown) => {
        this.detail.set(null);
        this.error.set(`No se pudo consultar el participante: ${errMsg(e)}`);
      },
    });
  }

  /** Guarda o quita (vacío) el WhatsApp. No crea otro participante ni modifica sus demás datos. */
  saveWhatsapp(s: Student): void {
    if (this.whatsappInvalid()) return;
    const value = cleanWhatsapp(this.whatsappDraft());
    this.clearMessages();
    this.busy.set(true);
    this.api.updateStudentContact(s.id, value || null).subscribe({
      next: (student) => {
        this.busy.set(false);
        this.detail.set(student);
        this.whatsappDraft.set(student.whatsapp ?? '');
        this.whatsappMessage.set(student.whatsapp ? 'WhatsApp actualizado.' : 'Se quitó el número de WhatsApp.');
        this.reload(this.query());
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(`No se pudo actualizar el WhatsApp: ${errMsg(e)}`);
      },
    });
  }

  private loadActivation(s: Student): void {
    this.activation.set(null);
    if (!s.activationPending) return;
    this.api.getActivationStatus(s.id).subscribe({ next: (a) => this.activation.set(a), error: (e: unknown) => this.error.set(errMsg(e)) });
  }

  linkLabel(a: ActivationStatus): string {
    return { VIGENTE: 'vigente', VENCIDO: 'vencido', USADO: 'usado', ANULADO: 'anulado', SIN_ENLACE: 'sin generar' }[a.linkState];
  }

  limaTime(iso: string): string {
    return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
  }

  /**
   * Activación manual: la pestaña se abre dentro del clic (si se abriera tras la respuesta, el navegador la bloquearía) y
   * luego recibe el wa.me. El Instructor revisa el mensaje y pulsa enviar; aquí solo se registra que WhatsApp se abrió.
   */
  sendWhatsapp(s: Student): void {
    this.clearMessages();
    this.whatsappPrepared.set(null);
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    this.busy.set(true);
    this.api.prepareWhatsappActivation(s.id).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (tab) tab.location.href = r.whatsappUrl;
        this.whatsappPrepared.set({ id: s.id, name: s.fullName, url: r.whatsappUrl, opened: !!tab });
        if (tab) this.confirmOpened(s.id);
        else if (this.detail()?.id === s.id) this.loadActivation(s);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        tab?.close();
        this.error.set(`No se pudo generar el enlace: ${errMsg(e)}`);
      },
    });
  }

  confirmOpened(id: string): void {
    this.api.markWhatsappOpened(id).subscribe({
      next: (a) => {
        if (this.detail()?.id === id) this.activation.set(a);
      },
      error: (e: unknown) => this.error.set(errMsg(e)),
    });
  }

  resend(s: Student): void {
    this.clearMessages();
    this.busy.set(true);
    this.api.resendActivation(s.id).subscribe({
      next: (activation) => {
        this.busy.set(false);
        this.delivery.set(deliveryMessage(s.email, activation));
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(`No se pudo reenviar el enlace a ${s.fullName}: ${errMsg(e)}`);
      },
    });
  }

  private clearMessages(): void {
    this.error.set('');
    this.registered.set(null);
    this.delivery.set(null);
    this.whatsappPrepared.set(null);
  }
}
