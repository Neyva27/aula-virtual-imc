import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { CertificateService } from '../../../core/services/certificate.service';
import { Certificate } from '../../../core/models/certificate.model';
import { Enrollment } from '../../../core/models/course.model';
import { DEMO_CONFIG } from '../../../core/config/demo.config';

@Component({
  selector: 'app-my-certificates',
  imports: [RouterLink, DatePipe],
  templateUrl: './my-certificates.html',
  styleUrl: './my-certificates.css',
})
export class MyCertificates {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly certService = inject(CertificateService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly downloadError = signal('');
  readonly downloadingId = signal<string | null>(null);

  readonly enrollment = signal<Enrollment | null>(null);
  readonly certificates = signal<Certificate[]>([]);
  readonly remainingAttempts = signal(0);
  readonly scaleMax = DEMO_CONFIG.exam.scaleMax;

  /** available: tiene certificado · pending: aprobó pero aún no se emite · none: sin certificado */
  readonly state = computed<'available' | 'pending' | 'none'>(() => {
    if (this.certificates().length > 0) return 'available';
    if (this.enrollment()?.status === 'aprobado') return 'pending';
    return 'none';
  });

  constructor() {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      enrollment: this.repo.getEnrollment(user.id),
      certificates: this.repo.getCertificates(user.id),
      attempts: this.repo.getAttempts(user.id),
      exam: this.repo.getExamConfig(),
    }).subscribe({
      next: ({ enrollment, certificates, attempts, exam }) => {
        this.enrollment.set(enrollment);
        this.certificates.set(certificates);
        this.remainingAttempts.set(Math.max(0, exam.maxAttempts - attempts.length));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar tus certificados. Intenta nuevamente.');
        this.loading.set(false);
      },
    });
  }

  async download(cert: Certificate): Promise<void> {
    this.downloadError.set('');
    this.downloadingId.set(cert.id);
    try {
      await this.certService.downloadPdf(cert);
    } catch {
      this.downloadError.set('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      this.downloadingId.set(null);
    }
  }
}
