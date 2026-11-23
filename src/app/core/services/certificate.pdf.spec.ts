import { TestBed } from '@angular/core/testing';
import { CertificateService } from './certificate.service';
import { Certificate } from '../models/certificate.model';

/** PDF del certificado (23/11/2026): datos completos y textos largos dentro de los márgenes de la hoja A4 horizontal. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const LONG: Certificate = {
  id: 'c', code: 'IMP-2026-0001', userId: 'u', courseId: 'k', attemptId: '',
  participantName: 'Maria de los Angeles Fernanda Guadalupe Rodriguez Santisteban de la Cruz Villanueva',
  participantFirstNames: 'Maria de los Angeles Fernanda Guadalupe', participantLastNames: 'Rodriguez Santisteban de la Cruz Villanueva', participantDni: '00000001',
  participantCompany: 'Corporacion Internacional de Servicios Industriales, Mineros y de Construccion del Sur del Peru S.A.C., Empresa Ficticia de Prueba Numero Dos S.A.',
  courseName: 'Curso ficticio de seguridad y salud en el trabajo en altura con sistemas de proteccion contra caidas para personal operativo y supervisores',
  courseLevel: 'persona_competente', imported: true, approvalDate: null, issueDate: '2026-10-15', score: null, scaleMax: null, trainingHours: 8, entityName: 'IM Corporacion SST Peru', status: 'vigente',
};
const MM = 72 / 25.4;

/** Textos del PDF con su posición inicial en milímetros. */
function textsOf(pdf: string): { text: string; x: number }[] {
  return [...pdf.matchAll(/([\d.]+) [\d.]+ Td\s*\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => ({ x: Number(m[1]) / MM, text: m[2] }));
}

describe('PDF del certificado', () => {
  it('incluye nombre, DNI, empresa y nivel, sin nota inventada y dentro del marco', () => {
    const texts = textsOf(TestBed.inject(CertificateService).buildPdf(LONG, PNG).output());
    const all = texts.map((t) => t.text).join(' ');
    expect(all).toContain(LONG.participantName);
    expect(all).toContain('DNI: 00000001');
    expect(all).toContain('Empresa: Corporacion');
    expect(all).toContain('Nivel: Persona competente');
    expect(all).toContain(LONG.code);
    expect(all).not.toContain('Nota:');
    expect(all).not.toContain('aprobaci');
    expect(texts.length).toBeGreaterThan(8);
    // Un texto centrado que empieza dentro del marco izquierdo (11 mm) también termina dentro del derecho.
    for (const t of texts) expect(t.x, t.text).toBeGreaterThanOrEqual(11);
  });

  it('un certificado emitido por la plataforma conserva aprobación y nota', () => {
    const cert: Certificate = { ...LONG, imported: undefined, approvalDate: '2026-10-12', score: 18, scaleMax: 20, participantCompany: undefined };
    const all = textsOf(TestBed.inject(CertificateService).buildPdf(cert, PNG).output()).map((t) => t.text).join(' ');
    expect(all).toContain('Nota: 18 / 20');
    expect(all).toContain('12/10/2026');
    expect(all).not.toContain('Empresa:');
  });
});
