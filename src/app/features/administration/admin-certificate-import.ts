import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ImportHistoryItem, ImportIssue, ImportPreview, ImportResult, ImportRowStatus, ImportTemplate } from '../../core/models/certificate-import.model';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import { CSV_MIME, buildCsv } from '../../core/utils/csv-export';
import { buildXlsx, downloadFile } from '../../core/utils/xlsx-export';
import { Icon } from '../../shared/components/icon';
import { errMsg } from './admin-utils';

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const PREVIEW_LIMIT = 200;
const STATUS_LABELS: Record<ImportRowStatus, string> = { valido: 'Válido', error: 'Con errores', duplicado: 'Duplicado' };

/** Validación previa en el navegador; el servidor vuelve a validar el archivo completo. */
export function importFileError(file: File): string {
  if (!/\.(xlsx|csv)$/i.test(file.name)) return 'Formato no admitido. Selecciona un archivo Excel (.xlsx) o CSV (.csv).';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > IMPORT_MAX_BYTES) return 'El archivo supera el tamaño máximo de 2 MB.';
  return '';
}

/**
 * «Importación masiva de certificados» (23/11/2026), dentro del panel del Instructor y solo con el permiso de
 * administración general. Seleccionar un archivo no guarda nada: primero se analiza y solo una confirmación expresa
 * importa las filas válidas.
 */
@Component({
  selector: 'app-admin-certificate-import',
  imports: [DatePipe, Icon],
  template: `
    <div class="stack">
      <header class="page-head">
        <h1>Importación masiva de certificados</h1>
        <p class="muted">Carga certificados desde Excel o CSV. Revisa la vista previa antes de confirmar: nada se guarda hasta entonces.</p>
      </header>

      @if (error()) { <p class="alert alert-danger" role="alert" data-test="error">{{ error() }}</p> }

      <section class="card stack" aria-labelledby="imp-template">
        <h2 id="imp-template">1. Prepara el archivo</h2>
        <ul class="small help">
          <li>Usa la plantilla sin cambiar los encabezados. Reemplaza las filas de ejemplo: son ficticias y no se importan.</li>
          <li>Obligatorios: nombres, apellidos, DNI, curso, código y fecha de emisión (AAAA-MM-DD o DD/MM/AAAA).</li>
          <li>El participante y el curso deben existir y ser tuyos. No se crean participantes, cursos ni empresas.</li>
          <li>La empresa debe ser una del participante. El nivel es opcional: persona_autorizada, persona_competente o persona_certificada.</li>
          <li>Guarda el DNI como texto para conservar los ceros iniciales. Máximo 2 MB y 5000 registros.</li>
        </ul>
        <div class="row">
          <button type="button" class="btn btn-secondary" (click)="downloadTemplate('xlsx')" data-test="template-xlsx"><app-icon name="download" size="sm" /> Plantilla Excel</button>
          <button type="button" class="btn btn-secondary" (click)="downloadTemplate('csv')" data-test="template-csv"><app-icon name="download" size="sm" /> Plantilla CSV</button>
        </div>
      </section>

      <section class="card stack" aria-labelledby="imp-file">
        <h2 id="imp-file">2. Selecciona y analiza</h2>
        <div class="field">
          <label for="imp-input">Archivo Excel (.xlsx) o CSV (.csv)</label>
          <input #fileInput id="imp-input" class="input" type="file" accept=".xlsx,.csv" (change)="pick(fileInput)" />
        </div>
        <div><button type="button" class="btn btn-primary" [class.is-loading]="analyzing()" [disabled]="!file() || analyzing() || importing()" (click)="analyze()" data-test="analyze">Analizar archivo</button></div>
      </section>

      @if (preview(); as p) {
        <section class="card stack" aria-labelledby="imp-preview" data-test="preview">
          <h2 id="imp-preview">3. Vista previa · {{ p.fileName }}</h2>
          <dl class="totals">
            <div><dt>Total</dt><dd data-test="total">{{ p.total }}</dd></div>
            <div><dt>Válidos</dt><dd data-test="valid">{{ p.valid }}</dd></div>
            <div><dt>Con errores</dt><dd data-test="errors">{{ p.errors }}</dd></div>
            <div><dt>Duplicados</dt><dd data-test="duplicates">{{ p.duplicates }}</dd></div>
          </dl>
          @if (missing().length) { <p class="small" data-test="missing">Campos faltantes: {{ missing().join(' · ') }}</p> }
          <div class="row">
            <label class="sr-only" for="imp-filter">Filtrar filas</label>
            <select id="imp-filter" class="input narrow" (change)="statusFilter.set($any($event.target).value)">
              <option value="">Todas las filas</option><option value="valido">Válidas</option><option value="error">Con errores</option><option value="duplicado">Duplicadas</option>
            </select>
            @if (p.errors + p.duplicates > 0) { <button type="button" class="btn btn-ghost" (click)="downloadIssues(p.fileName, previewIssues())" data-test="issues-csv">Descargar errores (CSV)</button> }
          </div>
          <div class="table-wrap table-cards">
            <table>
              <caption class="sr-only">Registros del archivo</caption>
              <thead><tr><th scope="col">Fila</th><th scope="col">Estado</th><th scope="col">Participante</th><th scope="col">DNI</th><th scope="col">Empresa</th><th scope="col">Curso</th><th scope="col">Código</th><th scope="col">Emisión</th><th scope="col">Observaciones</th></tr></thead>
              <tbody>
                @for (r of visibleRows(); track r.row) {
                  <tr [attr.data-row]="r.row" [attr.data-status]="r.status">
                    <td data-label="Fila">{{ r.row }}</td>
                    <td data-label="Estado"><span class="badge" [class]="badge(r.status)">{{ label(r.status) }}</span></td>
                    <td data-label="Participante">{{ r.values['nombres'] }} {{ r.values['apellidos'] }}</td>
                    <td data-label="DNI">{{ r.values['dni'] }}</td>
                    <td data-label="Empresa">{{ r.values['empresa'] || '—' }}</td>
                    <td data-label="Curso">{{ r.values['curso'] }}</td>
                    <td data-label="Código">{{ r.values['codigo_certificado'] }}</td>
                    <td data-label="Emisión">{{ r.values['fecha_emision'] }}</td>
                    <td data-label="Observaciones" class="small">@for (i of r.issues; track $index) { <span class="block"><strong>{{ i.field }}:</strong> {{ i.message }}</span> }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (filteredCount() > visibleRows().length) { <p class="small muted">Se muestran las primeras {{ visibleRows().length }} de {{ filteredCount() }} filas. El CSV de errores las incluye todas.</p> }

          <div class="confirm stack">
            <h3>4. Confirma la importación</h3>
            <p class="small">Se importarán <strong>{{ p.valid }}</strong> registros válidos en una sola operación. Las filas con errores o duplicadas se omiten.</p>
            <label class="check"><input type="checkbox" [checked]="accepted()" [disabled]="p.valid === 0" (change)="accepted.set($any($event.target).checked)" data-test="accept" /> Revisé la vista previa y confirmo la importación.</label>
            <div><button type="button" class="btn btn-primary" [class.is-loading]="importing()" [disabled]="!accepted() || p.valid === 0 || importing()" (click)="confirm()" data-test="confirm">Importar {{ p.valid }} certificados</button></div>
          </div>
        </section>
      }

      @if (result(); as r) {
        <section class="alert alert-success stack" role="status" data-test="result">
          <strong>Importación completada</strong>
          <span>Importados: {{ r.imported }} · Rechazados: {{ r.rejected }} · Duplicados: {{ r.duplicates }} · Total: {{ r.total }}</span>
          <span class="small">{{ r.importedAt | date: 'dd/MM/yyyy HH:mm' : '-0500' }} · {{ r.actorName }} · {{ r.fileName }}</span>
          @if (r.issues.length) { <div><button type="button" class="btn btn-secondary btn-sm" (click)="downloadIssues(r.fileName, r.issues)">Descargar errores (CSV)</button></div> }
        </section>
      }

      @if (history().length) {
        <section class="card stack" aria-labelledby="imp-history">
          <h2 id="imp-history">Importaciones realizadas</h2>
          <div class="table-wrap table-cards">
            <table>
              <caption class="sr-only">Historial de importaciones</caption>
              <thead><tr><th scope="col">Fecha</th><th scope="col">Archivo</th><th scope="col">Usuario</th><th scope="col">Importados</th><th scope="col">Rechazados</th><th scope="col">Duplicados</th></tr></thead>
              <tbody>
                @for (h of history(); track h.id) {
                  <tr><td data-label="Fecha">{{ h.importedAt | date: 'dd/MM/yyyy HH:mm' : '-0500' }}</td><td data-label="Archivo">{{ h.fileName }}</td><td data-label="Usuario">{{ h.actorName }}</td><td data-label="Importados">{{ h.imported }}</td><td data-label="Rechazados">{{ h.rejected }}</td><td data-label="Duplicados">{{ h.duplicates }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .help { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; }
      .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; margin: 0; }
      .totals div { padding: 0.6rem 0.8rem; border: 1px solid var(--c-border); border-radius: var(--radius-sm); }
      .totals dt { font-size: 0.8rem; color: var(--c-muted); }
      .totals dd { margin: 0; font-size: 1.4rem; font-weight: 700; }
      .narrow { max-width: 220px; }
      .block { display: block; }
      .check { display: flex; align-items: center; gap: 0.5rem; }
      .confirm { border-top: 1px solid var(--c-border); padding-top: 0.85rem; }
      h3 { margin: 0; font-size: 1rem; }
    `,
  ],
})
export class AdminCertificateImport {
  private readonly api = inject(ApiDataRepository);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly file = signal<File | null>(null);
  readonly preview = signal<ImportPreview | null>(null);
  readonly result = signal<ImportResult | null>(null);
  readonly history = signal<ImportHistoryItem[]>([]);
  readonly error = signal('');
  readonly analyzing = signal(false);
  readonly importing = signal(false);
  readonly accepted = signal(false);
  readonly statusFilter = signal<ImportRowStatus | ''>('');

  private readonly filteredRows = computed(() => {
    const status = this.statusFilter();
    return (this.preview()?.rows ?? []).filter((r) => !status || r.status === status);
  });
  readonly filteredCount = computed(() => this.filteredRows().length);
  readonly visibleRows = computed(() => this.filteredRows().slice(0, PREVIEW_LIMIT));
  readonly previewIssues = computed(() => (this.preview()?.rows ?? []).flatMap((r) => r.issues));
  readonly missing = computed(() => Object.entries(this.preview()?.missingFields ?? {}).map(([field, n]) => `${field}: ${n}`));

  constructor() {
    this.loadHistory();
  }

  label = (s: ImportRowStatus) => STATUS_LABELS[s];
  badge = (s: ImportRowStatus) => (s === 'valido' ? 'badge--success' : s === 'error' ? 'badge--danger' : 'badge--warning');

  private loadHistory(): void {
    this.api.listCertificateImports().subscribe({ next: (list) => this.history.set(list), error: (e: unknown) => this.error.set(errMsg(e)) });
  }

  /** Cambiar de archivo descarta la vista previa anterior y la confirmación. */
  pick(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    this.preview.set(null);
    this.result.set(null);
    this.accepted.set(false);
    this.statusFilter.set('');
    const problem = file ? importFileError(file) : '';
    this.error.set(problem);
    this.file.set(file && !problem ? file : null);
    if (problem) input.value = '';
  }

  analyze(): void {
    const file = this.file();
    if (!file) return;
    this.error.set('');
    this.result.set(null);
    this.accepted.set(false);
    this.analyzing.set(true);
    this.api.previewCertificateImport(file).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.analyzing.set(false);
      },
      error: (e: unknown) => {
        this.preview.set(null);
        this.error.set(errMsg(e));
        this.analyzing.set(false);
      },
    });
  }

  confirm(): void {
    const file = this.file();
    const p = this.preview();
    if (!file || !p || !this.accepted() || p.valid === 0) return;
    this.error.set('');
    this.importing.set(true);
    this.api.confirmCertificateImport(file, p.fileHash).subscribe({
      next: (r) => {
        this.result.set(r);
        this.preview.set(null);
        this.file.set(null);
        // Sin esto, volver a elegir el mismo archivo no dispara «change» y «Analizar» queda deshabilitado.
        const input = this.fileInput()?.nativeElement;
        if (input) input.value = '';
        this.accepted.set(false);
        this.importing.set(false);
        this.loadHistory();
      },
      error: (e: unknown) => {
        this.error.set(errMsg(e));
        this.accepted.set(false);
        this.importing.set(false);
      },
    });
  }

  /** Las plantillas se arman con las columnas que declara el servidor: siempre coinciden con lo que valida. */
  downloadTemplate(format: 'xlsx' | 'csv'): void {
    this.error.set('');
    this.api.certificateImportTemplate().subscribe({
      next: (t: ImportTemplate) => {
        const rows = [t.columns, ...t.examples];
        if (format === 'xlsx') downloadFile(buildXlsx(rows, { sheetName: 'Certificados', widths: t.columns.map(() => 24) }), 'plantilla-certificados.xlsx');
        else downloadFile(buildCsv(rows), 'plantilla-certificados.csv', CSV_MIME);
      },
      error: (e: unknown) => this.error.set(errMsg(e)),
    });
  }

  downloadIssues(fileName: string, issues: ImportIssue[]): void {
    const base = fileName.replace(/\.[^.]+$/, '');
    downloadFile(buildCsv([['Fila', 'Campo', 'Motivo'], ...issues.map((i) => [String(i.row), i.field, i.message])]), `errores-${base}.csv`, CSV_MIME);
  }
}
