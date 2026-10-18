import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Certificate } from '../../../core/models/certificate.model';
import { DEMO_CONFIG } from '../../../core/config/demo.config';

@Component({
  selector: 'app-certificate-view',
  imports: [DatePipe],
  templateUrl: './certificate-view.html',
  styleUrl: './certificate-view.css',
})
export class CertificateView {
  readonly cert = input.required<Certificate>();
  readonly qr = input<string | null>(null);
  readonly scaleMax = DEMO_CONFIG.exam.scaleMax;
}
