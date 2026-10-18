import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DataRepository } from '../../core/services/data-repository';
import { CertificateService } from '../../core/services/certificate.service';
import { Certificate } from '../../core/models/certificate.model';
import { CertificateView } from '../certificates/certificate-view/certificate-view';
import { errMsg } from './admin-utils';

@Component({
  selector: 'app-admin-certificates',
  imports: [DatePipe, CertificateView],
  template: `
    <div class="stack">
      <header>
        <h1>Certificados emitidos</h1>
        <p class="muted">Consulta y descarga los certificados generados por la plataforma.</p>
      </header>

      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (certificates().length === 0) {
        <p class="card muted">Aún no se han emitido certificados.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Código</th><th>Participante</th><th>Curso</th><th>Fecha de emisión</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              @for (c of certificates(); track c.id) {
                <tr>
                  <td class="code">{{ c.code }}</td>
                  <td>{{ c.participantName }}</td>
                  <td>{{ c.courseName }}</td>
                  <td>{{ c.issueDate | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    <span class="badge" [class]="c.status === 'vigente' ? 'badge--success' : 'badge--danger'">
                      {{ c.status === 'vigente' ? 'Vigente' : 'Revocado' }}
                    </span>
                  </td>
                  <td>
                    <div class="row act">
                      <button type="button" class="btn btn-secondary" (click)="view(c)">Visualizar</button>
                      <button
                        type="button"
                        class="btn btn-primary"
                        [class.is-loading]="downloadingId() === c.id"
                        [disabled]="downloadingId() === c.id"
                        (click)="download(c)"
                      >
                        Descargar
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <p class="small muted">Plantilla provisional y datos de demostración.</p>
    </div>

    @if (selected(); as cert) {
      <div class="overlay" (click)="close()">
        <div class="dialog card stack" role="dialog" aria-modal="true" aria-label="Vista previa del certificado" (click)="$event.stopPropagation()">
          <div class="row bar">
            <h2>Vista previa · {{ cert.code }}</h2>
            <button type="button" class="btn btn-secondary" (click)="close()">Cerrar</button>
          </div>
          <div class="scroll"><app-certificate-view [cert]="cert" [qr]="qr()" /></div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .code { font-family: Consolas, 'Courier New', monospace; }
      .act { flex-wrap: nowrap; gap: 0.35rem; }
      .act .btn { min-height: 36px; padding: 0.3rem 0.7rem; font-size: 0.85rem; }
      .overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 1rem; background: rgba(10, 20, 50, 0.55); }
      .dialog { width: 100%; max-width: 1000px; max-height: 92vh; overflow: auto; }
      .bar { justify-content: space-between; }
      .bar h2 { margin: 0; }
      .scroll { overflow-x: auto; }
      .scroll app-certificate-view { min-width: 640px; }
    `,
  ],
})
export class AdminCertificates {
  private readonly repo = inject(DataRepository);
  private readonly certService = inject(CertificateService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly certificates = signal<Certificate[]>([]);
  readonly selected = signal<Certificate | null>(null);
  readonly qr = signal<string | null>(null);
  readonly downloadingId = signal<string | null>(null);

  constructor() {
    this.repo.getCertificates().subscribe({
      next: (list) => {
        this.certificates.set(list);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  view(c: Certificate): void {
    this.selected.set(c);
    this.qr.set(null);
    this.certService
      .qrDataUrl(c.code)
      .then((url) => this.qr.set(url))
      .catch(() => this.qr.set(null));
  }

  close(): void {
    this.selected.set(null);
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
