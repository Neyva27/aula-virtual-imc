import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { CertificateService } from '../../../core/services/certificate.service';
import { Certificate } from '../../../core/models/certificate.model';
import { CertificateView } from '../certificate-view/certificate-view';
import { Icon } from '../../../shared/components/icon';

@Component({
  selector: 'app-certificate-detail',
  imports: [RouterLink, CertificateView, Icon],
  templateUrl: './certificate-detail.html',
  styleUrl: './certificate-detail.css',
})
export class CertificateDetail implements OnInit {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly certService = inject(CertificateService);

  /** Parámetro :id de la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly loading = signal(true);
  readonly cert = signal<Certificate | null>(null);
  readonly qr = signal<string | null>(null);
  readonly downloading = signal(false);
  readonly downloadError = signal('');

  ngOnInit(): void {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    // Solo se buscan los certificados del propio participante (RN-16).
    this.repo.getCertificates(user.id).subscribe({
      next: (list) => {
        const found = list.find((c) => c.id === this.id()) ?? null;
        this.cert.set(found);
        this.loading.set(false);
        if (found) {
          this.certService
            .qrDataUrl(found.code)
            .then((url) => this.qr.set(url))
            .catch(() => this.qr.set(null));
        }
      },
      error: () => this.loading.set(false),
    });
  }

  async download(): Promise<void> {
    const cert = this.cert();
    if (!cert) return;
    this.downloadError.set('');
    this.downloading.set(true);
    try {
      await this.certService.downloadPdf(cert);
    } catch {
      this.downloadError.set('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      this.downloading.set(false);
    }
  }
}
