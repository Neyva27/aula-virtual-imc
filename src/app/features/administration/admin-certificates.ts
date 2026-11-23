import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { buildPdfReport } from '../../core/utils/pdf-report';
import { buildXlsx, downloadFile } from '../../core/utils/xlsx-export';
import { CSV_MIME, buildCsv } from '../../core/utils/csv-export';
import { DatePipe } from '@angular/common';
import { CertificateFilter, DataRepository } from '../../core/services/data-repository';
import { CertificateService } from '../../core/services/certificate.service';
import { Certificate } from '../../core/models/certificate.model';
import { CertificateView } from '../certificates/certificate-view/certificate-view';
import { errMsg } from './admin-utils';
import { Icon } from '../../shared/components/icon';
import { trapTab } from '../../shared/a11y/focus-trap';

@Component({
  selector: 'app-admin-certificates',
  imports: [DatePipe, CertificateView, Icon],
  template: `
    <div class="stack">
      <header class="page-head">
        <h1>Certificados emitidos</h1>
        <p class="muted">Consulta, filtra y descarga los certificados de tus participantes.</p>
      </header>

      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (all().length === 0) {
        <p class="card muted">Aún no se han emitido certificados.</p>
      } @else {
        <!-- 20/11/2026: filtros combinables (estudiante, código, empresa y fechas). En modo API se aplican en el servidor. -->
        <form class="card stack filters-card" (submit)="$event.preventDefault(); search()" aria-label="Filtros de certificados" data-cert-filters>
          <div class="filters-grid">
            <div class="field">
              <label for="cert-student">Estudiante</label>
              <input id="cert-student" class="input" type="search" maxlength="100" autocomplete="off" placeholder="Nombre o apellido"
                [value]="student()" (input)="student.set($any($event.target).value)" />
            </div>
            <div class="field">
              <label for="cert-code">Código del certificado</label>
              <input id="cert-code" class="input code" type="search" maxlength="40" autocomplete="off" placeholder="Ej.: IMC-2026"
                [value]="code()" (input)="code.set($any($event.target).value)" />
            </div>
            <div class="field">
              <label for="cert-company">Empresa</label>
              <select id="cert-company" class="input" (change)="companyId.set($any($event.target).value)">
                <option value="" [selected]="!companyId()">Todas las empresas</option>
                @for (c of companies(); track c.id) {
                  <option [value]="c.id" [selected]="companyId() === c.id">{{ c.name }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="cert-from">Emitidos desde</label>
              <input id="cert-from" class="input" type="date" [value]="dateFrom()" (change)="dateFrom.set($any($event.target).value)" />
            </div>
            <div class="field">
              <label for="cert-to">Emitidos hasta</label>
              <input id="cert-to" class="input" type="date" [value]="dateTo()" (change)="dateTo.set($any($event.target).value)" />
            </div>
          </div>
          @if (filterError()) { <p class="alert alert-danger small" role="alert">{{ filterError() }}</p> }
          <div class="row actions-bar">
            <div class="row">
              <button type="submit" class="btn btn-primary" [class.is-loading]="searching()" [disabled]="searching()" data-test="search">Buscar</button>
              <button type="button" class="btn btn-ghost" (click)="clearFilters()" [disabled]="searching() || !hasFilters()" data-test="clear">Limpiar filtros</button>
            </div>
            <div class="row export-buttons">
              <button type="button" class="btn btn-secondary" [disabled]="searching() || filtered().length === 0" (click)="exportPdf()">Exportar a PDF</button>
              <button type="button" class="btn btn-secondary" [disabled]="searching() || filtered().length === 0" (click)="exportExcel()">Exportar a Excel</button>
              <button type="button" class="btn btn-secondary" [disabled]="searching() || filtered().length === 0" (click)="exportCsv()">Exportar a CSV</button>
            </div>
          </div>
        </form>
        <p class="small result-count" role="status" data-test="result-count">
          <strong>{{ filtered().length }}</strong> {{ filtered().length === 1 ? 'certificado encontrado' : 'certificados encontrados' }}{{ applied() ? ' con los filtros aplicados' : '' }}
          · {{ vigentes() }} {{ vigentes() === 1 ? 'vigente' : 'vigentes' }}, {{ filtered().length - vigentes() }} {{ filtered().length - vigentes() === 1 ? 'revocado' : 'revocados' }}
        </p>
        @if (exportMessage()) { <p class="small muted" role="status">{{ exportMessage() }}</p> }
        @if (filtered().length === 0) {
          <p class="card muted" data-test="no-match">No hay certificados que coincidan con los filtros.</p>
        } @else {
        <div class="table-wrap table-cards">
          <table>
            <caption class="sr-only">Certificados emitidos</caption>
            <thead>
              <tr>
                <th scope="col">Código</th><th scope="col">Participante</th><th scope="col">Empresa</th><th scope="col">Curso</th>
                <th scope="col">Fecha de emisión</th><th scope="col">Estado</th><th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (c of filtered(); track c.id) {
                <tr [attr.data-certificate]="c.id">
                  <td class="code" data-label="Código">{{ c.code }}</td>
                  <td data-label="Participante">{{ c.participantName }}</td>
                  <td data-label="Empresa">{{ companyNames(c) }}</td>
                  <td data-label="Curso">{{ c.courseName }}</td>
                  <td data-label="Fecha de emisión">{{ c.issueDate | date: 'dd/MM/yyyy' }}</td>
                  <td data-label="Estado">
                    <span class="badge" [class]="c.status === 'vigente' ? 'badge--success' : 'badge--danger'">
                      {{ c.status === 'vigente' ? 'Vigente' : 'Revocado' }}
                    </span>
                  </td>
                  <td class="actions">
                    <div class="row act">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="view(c)" [attr.aria-label]="'Visualizar certificado ' + c.code"><app-icon name="eye" size="sm" /> Visualizar</button>
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        [class.is-loading]="downloadingId() === c.id"
                        [disabled]="downloadingId() === c.id"
                        (click)="download(c)"
                        [attr.aria-label]="'Descargar certificado ' + c.code"
                      >
                        <app-icon name="download" size="sm" /> Descargar
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        }
      }
      <p class="small muted demo-only">Plantilla provisional y datos de demostración.</p>
    </div>

    @if (selected(); as cert) {
      <div class="overlay" (click)="close()">
        <div
          #certDialog
          class="dialog card stack"
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del certificado"
          (click)="$event.stopPropagation()"
          (keydown)="dialogKey($event)"
        >
          <div class="row bar">
            <h2>Vista previa · {{ cert.code }}</h2>
            <button #closeDialog type="button" class="btn btn-secondary" (click)="close()">Cerrar</button>
          </div>
          <div class="scroll"><app-certificate-view [cert]="cert" [qr]="qr()" /></div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .code { font-family: Consolas, 'Courier New', monospace; }
      .filters-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
      .filters-grid .field { margin: 0; }
      .actions-bar { justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
      .result-count { margin: 0; }
      .act { flex-wrap: nowrap; gap: 0.35rem; }
      .overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 1rem; background: rgba(10, 20, 50, 0.55); }
      .dialog { width: 100%; max-width: 1000px; max-height: 92vh; overflow: auto; }
      .bar { justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
      .bar h2 { margin: 0; }
      /* El certificado escala de forma proporcional con su contenedor (cqw): sin ancho mínimo. */
      .scroll app-certificate-view { max-width: 980px; margin: 0 auto; }
      @media (max-width: 700px) { .overlay { padding: 0.5rem; } .dialog { padding: 0.85rem; } }
    `,
  ],
})
export class AdminCertificates {
  private readonly repo = inject(DataRepository);
  private readonly certService = inject(CertificateService);

  readonly loading = signal(true);
  readonly error = signal('');
  /** Todos los certificados del alcance del Instructor (sin filtros): alimentan el selector de empresas. */
  readonly all = signal<Certificate[]>([]);
  /** Resultado de la última búsqueda, completo (sin paginación): es lo que se muestra y se exporta. */
  readonly filtered = signal<Certificate[]>([]);
  readonly selected = signal<Certificate | null>(null);
  readonly qr = signal<string | null>(null);
  readonly downloadingId = signal<string | null>(null);
  readonly student = signal('');
  readonly code = signal('');
  readonly companyId = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly searching = signal(false);
  readonly filterError = signal('');
  /** Filtros con los que se obtuvo `filtered` (null = sin filtros); se describen en el reporte. */
  readonly applied = signal<CertificateFilter | null>(null);
  readonly exportMessage = signal('');

  /** Empresas de los participantes con certificados (sin repetir, por nombre). */
  readonly companies = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.all()) for (const x of c.companies ?? []) map.set(x.id, x.name);
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });
  readonly vigentes = computed(() => this.filtered().filter((c) => c.status === 'vigente').length);
  readonly hasFilters = computed(
    () => !!(this.student().trim() || this.code().trim() || this.companyId() || this.dateFrom() || this.dateTo() || this.applied()),
  );

  companyNames(c: Certificate): string {
    // La empresa guardada al emitir tiene prioridad; los certificados anteriores usan las empresas actuales del participante.
    return c.participantCompany || (c.companies ?? []).map((x) => x.name).join(', ') || 'Sin empresa';
  }

  private currentFilter(): CertificateFilter {
    const f: CertificateFilter = {};
    if (this.student().trim()) f.student = this.student().trim();
    if (this.code().trim()) f.code = this.code().trim();
    if (this.companyId()) f.companyId = this.companyId();
    if (this.dateFrom()) f.from = this.dateFrom();
    if (this.dateTo()) f.to = this.dateTo();
    return f;
  }

  /** Aplica todos los filtros a la vez (en modo API, en el servidor y dentro del alcance del Instructor). */
  search(): void {
    this.filterError.set('');
    this.exportMessage.set('');
    if (this.dateFrom() && this.dateTo() && this.dateFrom() > this.dateTo()) {
      this.filterError.set('La fecha «Emitidos desde» no puede ser posterior a «Emitidos hasta».');
      return;
    }
    const filter = this.currentFilter();
    this.searching.set(true);
    this.repo.listCertificates(filter).subscribe({
      next: (list) => {
        this.filtered.set(list);
        this.applied.set(Object.keys(filter).length ? filter : null);
        this.searching.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.searching.set(false);
      },
    });
  }

  clearFilters(): void {
    this.student.set('');
    this.code.set('');
    this.companyId.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.filterError.set('');
    this.exportMessage.set('');
    this.applied.set(null);
    this.filtered.set(this.all());
  }

  private reportRows(): string[][] {
    const fmt = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
    return this.filtered().map((c) => [
      c.code,
      c.participantName,
      c.participantDni || 'No registrado',
      this.companyNames(c),
      c.courseName,
      c.score !== null && c.scaleMax !== null ? `${c.score} / ${c.scaleMax}` : 'No aplica',
      fmt(c.issueDate),
      c.status === 'vigente' ? 'Vigente' : 'Revocado',
    ]);
  }

  /** Filtros aplicados, en texto, para el encabezado del reporte. */
  private filterSummary(): string[] {
    const f = this.applied() ?? {};
    const fmt = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');
    const parts: string[] = [];
    if (f.companyId) parts.push(`Empresa: ${this.companies().find((c) => c.id === f.companyId)?.name ?? '—'}`);
    if (f.student) parts.push(`Estudiante: «${f.student}»`);
    if (f.code) parts.push(`Código: «${f.code}»`);
    parts.push(`Emitidos: ${fmt(f.from) || 'sin inicio'} a ${fmt(f.to) || 'hoy'}`);
    const n = this.filtered().length;
    return [`${parts.join(' · ')} · ${n} ${n === 1 ? 'certificado' : 'certificados'}`];
  }

  private static readonly HEADERS = ['Código', 'Participante', 'DNI', 'Empresa', 'Curso', 'Nota', 'Fecha de emisión', 'Estado'];
  private static readonly WIDTHS = [22, 28, 11, 26, 32, 10, 15, 11];

  exportPdf(): void {
    const rows = this.reportRows();
    const filename = `certificados-${new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)}.pdf`;
    buildPdfReport({
      title: 'Reporte de certificados emitidos',
      subtitle: this.filterSummary(),
      headers: AdminCertificates.HEADERS,
      rows,
      widths: AdminCertificates.WIDTHS,
    }).save(filename);
    this.exportMessage.set(`Se descargó «${filename}» con ${rows.length} ${rows.length === 1 ? 'certificado' : 'certificados'}.`);
  }

  exportExcel(): void {
    const rows = this.reportRows();
    const filename = `certificados-${new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)}.xlsx`;
    downloadFile(buildXlsx([AdminCertificates.HEADERS, ...rows], { sheetName: 'Certificados', widths: AdminCertificates.WIDTHS }), filename);
    this.exportMessage.set(`Se descargó «${filename}» con ${rows.length} ${rows.length === 1 ? 'certificado' : 'certificados'}.`);
  }

  exportCsv(): void {
    const rows = this.reportRows();
    const filename = `certificados-${new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)}.csv`;
    downloadFile(buildCsv([AdminCertificates.HEADERS, ...rows]), filename, CSV_MIME);
    this.exportMessage.set(`Se descargó «${filename}» con ${rows.length} ${rows.length === 1 ? 'certificado' : 'certificados'}.`);
  }

  constructor() {
    this.repo.listCertificates().subscribe({
      next: (list) => {
        this.all.set(list);
        this.filtered.set(list);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  private readonly certDialog = viewChild<ElementRef<HTMLElement>>('certDialog');
  private readonly closeDialog = viewChild<ElementRef<HTMLButtonElement>>('closeDialog');
  /** Botón que abrió la vista previa: recupera el foco al cerrarla (V5). */
  private opener: HTMLElement | null = null;

  view(c: Certificate): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => this.closeDialog()?.nativeElement.focus());
    this.selected.set(c);
    this.qr.set(null);
    this.certService
      .qrDataUrl(c.code)
      .then((url) => this.qr.set(url))
      .catch(() => this.qr.set(null));
  }

  close(): void {
    this.selected.set(null);
    const opener = this.opener;
    this.opener = null;
    setTimeout(() => opener?.focus());
  }

  /** Escape cierra la vista previa; el tabulador no sale del diálogo. */
  dialogKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    const dialog = this.certDialog()?.nativeElement;
    if (dialog) trapTab(event, dialog);
  }

  async download(c: Certificate): Promise<void> {
    this.error.set('');
    this.downloadingId.set(c.id);
    try {
      await this.certService.downloadPdf(c);
    } catch {
      this.error.set('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      this.downloadingId.set(null);
    }
  }
}
