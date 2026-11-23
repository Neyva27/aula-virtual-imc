import { CourseLevel } from './course.model';

export type CertificateStatus = 'vigente' | 'revocado';

/** Conserva los datos del momento de emisión (RN-08). */
export interface Certificate {
  id: string;
  code: string; // código único (RN-08)
  userId: string;
  courseId: string;
  attemptId: string; // una sola aprobación => un solo certificado válido
  participantName: string;
  /** Copias del momento de emisión (23/11/2026). Los certificados anteriores no las tienen: no se completan. */
  participantFirstNames?: string;
  participantLastNames?: string;
  participantDni?: string;
  participantCompany?: string;
  courseName: string;
  courseLevel?: CourseLevel | null;
  /** Certificado cargado por importación masiva: no tiene intento, nota ni fecha de aprobación. */
  imported?: boolean;
  approvalDate: string | null; // ISO
  issueDate: string; // ISO
  score: number | null;
  scaleMax: number | null;
  trainingHours: number | null; // null = por definir
  entityName: string;
  status: CertificateStatus;
  /** Certificados del Instructor (20/11/2026): empresas del participante (vacío si no tiene). No va en el PDF. */
  companies?: { id: string; name: string }[];
}

/**
 * Filtros de «Certificados emitidos» (20/11/2026), combinables. Estudiante: cada palabra debe aparecer en el nombre
 * (parcial, sin distinguir mayúsculas ni tildes). Código: parcial. Fechas AAAA-MM-DD (emisión, inclusive).
 */
export interface CertificateSearch {
  student?: string;
  code?: string;
  companyId?: string;
  from?: string;
  to?: string;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Misma regla que el servidor (GET /certificates): se usa en la demostración. */
export function matchesCertificate(c: Certificate, f: CertificateSearch): boolean {
  const tokens = fold(f.student ?? '').split(/\s+/).filter(Boolean);
  const name = fold(c.participantName);
  const code = (f.code ?? '').trim().toUpperCase();
  const day = c.issueDate.slice(0, 10);
  return (
    tokens.every((t) => name.includes(t)) &&
    (!code || c.code.toUpperCase().includes(code)) &&
    (!f.companyId || (c.companies ?? []).some((x) => x.id === f.companyId)) &&
    (!f.from || day >= f.from) &&
    (!f.to || day <= f.to)
  );
}
