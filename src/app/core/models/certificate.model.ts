export type CertificateStatus = 'vigente' | 'revocado';

export interface Certificate {
  id: string;
  code: string; // código único (RN-08)
  userId: string;
  attemptId: string; // una sola aprobación => un solo certificado válido
  participantName: string;
  participantDni?: string;
  courseName: string;
  approvalDate: string; // ISO
  issueDate: string; // ISO
  score: number;
  trainingHours: number;
  entityName: string;
  status: CertificateStatus;
}
