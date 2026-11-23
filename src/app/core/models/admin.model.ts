/**
 * Administración general de IMC (permiso IMC_GENERAL_ADMIN), contrato real de NestJS (`/admin/...`). Estas opciones
 * se muestran dentro del panel del Instructor solo a quien tiene el permiso: no hay un tercer panel.
 */
import type { ActivationSummary } from './student.model';

export const GENERAL_ADMIN = 'IMC_GENERAL_ADMIN';

/** Empresa (`CompanyDto`). */
export interface AdminCompany {
  id: string;
  name: string;
  ruc: string;
  contactEmail: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInput {
  name: string;
  ruc: string;
  contactEmail?: string | null;
}

/** Empresa asignada a un Instructor (`AssignedCompanyDto`). */
export interface AssignedCompany {
  id: string;
  name: string;
  ruc: string;
  active: boolean;
  assignedAt: string;
}

/** Indicadores del panel del Instructor (`GET /dashboard`), calculados en MySQL. */
export interface DashboardStats {
  participants: { total: number; active: number; pendingActivation: number; inactive: number };
  courses: { total: number; published: number; active: number };
  enrollments: { total: number; byStatus: Record<string, number> };
  evaluations: { total: number; approved: number; failed: number; inReview: number };
  certificates: { issued: number };
  activity: { date: string; attempts: number; certificates: number }[];
  recent: { type: 'intento' | 'certificado'; date: string; courseName: string; studentId: string; passed: boolean; inReview: boolean }[];
}
