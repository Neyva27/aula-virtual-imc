import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { toDataURL } from 'qrcode';
import { Certificate } from '../models/certificate.model';
import { DEMO_CONFIG } from '../config/demo.config';

/**
 * QR y PDF DE DEMOSTRACIÓN. El QR apunta a la página de verificación local y NO es un QR oficial.
 * La emisión oficial y la verificación definitiva se harán en el backend.
 */
@Injectable({ providedIn: 'root' })
export class CertificateService {
  verificationUrl(code: string): string {
    return `${window.location.origin}/verificar/${encodeURIComponent(code)}`;
  }

  qrDataUrl(code: string): Promise<string> {
    return toDataURL(this.verificationUrl(code), { margin: 1, width: 280 });
  }

  async downloadPdf(cert: Certificate): Promise<void> {
    const qr = await this.qrDataUrl(cert.code);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297;
    const H = 210;
    const navy: [number, number, number] = [10, 30, 80];
    const gray: [number, number, number] = [91, 101, 121];

    // Marco
    doc.setDrawColor(...navy);
    doc.setLineWidth(1.2);
    doc.rect(8, 8, W - 16, H - 16);
    doc.setLineWidth(0.3);
    doc.rect(11, 11, W - 22, H - 22);

    // Espacio para el logotipo oficial
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(20, 18, 38, 18);
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('LOGO OFICIAL', 39, 26, { align: 'center' });
    doc.text('(por incorporar)', 39, 30, { align: 'center' });

    // Aviso de plantilla provisional
    doc.setTextColor(180, 35, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('PLANTILLA PROVISIONAL', W - 20, 24, { align: 'right' });

    // Entidad capacitadora
    doc.setTextColor(...navy);
    doc.setFontSize(12);
    doc.text(cert.entityName.toUpperCase(), W / 2, 30, { align: 'center' });

    // Título
    doc.setFontSize(30);
    doc.text('CERTIFICADO', W / 2, 58, { align: 'center', charSpace: 2 });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    doc.setFontSize(12);
    doc.text('Se otorga a', W / 2, 73, { align: 'center' });

    // Participante
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text(cert.participantName, W / 2, 88, { align: 'center', maxWidth: 240 });
    doc.setLineWidth(0.3);
    doc.line(60, 92, W - 60, 92);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    doc.setFontSize(12);
    doc.text('por haber aprobado el curso', W / 2, 104, { align: 'center' });

    // Curso
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const courseLines = doc.splitTextToSize(cert.courseName, 220) as string[];
    doc.text(courseLines, W / 2, 114, { align: 'center' });

    // Datos
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(23, 32, 51);
    doc.setFontSize(11);
    const facts =
      `Fecha de aprobación: ${this.fmt(cert.approvalDate)}   -   ` +
      `Nota: ${cert.score} / ${DEMO_CONFIG.exam.scaleMax}   -   ` +
      `Horas de formación: ${cert.trainingHours} h`;
    doc.text(facts, W / 2, 140, { align: 'center' });
    doc.text(`Fecha de emisión: ${this.fmt(cert.issueDate)}`, W / 2, 148, { align: 'center' });

    // Firma (sin inventar firmantes)
    doc.setDrawColor(...gray);
    doc.line(26, 178, 96, 178);
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text('Firma autorizada (por definir)', 61, 183, { align: 'center' });

    // QR + código
    doc.addImage(qr, 'PNG', W - 20 - 30, 146, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text(`Código: ${cert.code}`, W - 35, 181, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...gray);
    doc.text('QR de prueba', W - 35, 185, { align: 'center' });

    doc.setFontSize(7.5);
    doc.text('Documento de demostración - sin validez oficial', W / 2, 194, { align: 'center' });

    doc.save(`certificado-${cert.code}.pdf`);
  }

  private fmt(iso: string): string {
    const [y, m, d] = iso.substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
