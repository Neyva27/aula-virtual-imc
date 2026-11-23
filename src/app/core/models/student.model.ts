/**
 * Estudiantes del modo API (contrato de NestJS, módulo `students`). Son datos REALES del servidor: no se mezclan con
 * los modelos de la demostración (`User`, `Enrollment`…), que siguen alimentando el modo demo.
 */

/** WhatsApp (23/11/2026): se ignoran espacios, guiones y paréntesis. No se agrega prefijo ni se completa el dato. */
export const WHATSAPP_PATTERN = /^(\+[1-9]\d{7,14}|9\d{8})$/;
export const WHATSAPP_ERROR = 'Ingresa un WhatsApp válido: celular de 9 dígitos que empiece con 9, o con prefijo internacional (+51…).';
export const cleanWhatsapp = (value: string): string => value.replace(/[\s()-]/g, '');
export const isValidWhatsapp = (value: string): boolean => !value.trim() || WHATSAPP_PATTERN.test(cleanWhatsapp(value));

/** Empresa visible para el Instructor (`StudentCompanyDto`): solo las de su alcance, con su estado. */
export interface StudentCompany {
  id: string;
  name: string;
  ruc: string;
  active: boolean;
}

/** Estudiante (`StudentDto`). Sin datos de autenticación, rol ni empresas ajenas al Instructor. */
export interface Student {
  id: string;
  email: string;
  firstNames: string;
  lastNames: string;
  fullName: string;
  dni: string;
  /** null = no registrado (participantes anteriores). */
  whatsapp?: string | null;
  /** Estado de la cuenta (no indica si ya activó su contraseña). */
  active: boolean;
  /** true mientras no haya creado su contraseña con el enlace de activación. */
  activationPending?: boolean;
  companies: StudentCompany[];
}

/** Respuesta paginada de GET /students (`StudentPageDto`). */
export interface StudentPage {
  items: Student[];
  /** Total de estudiantes que cumplen los filtros (todas las páginas). */
  total: number;
  page: number;
  pageSize: number;
}

/** Parámetros de GET /students. Los vacíos no se envían. */
export interface StudentQuery {
  q?: string;
  companyId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Cuerpo de POST /students (`RegisterStudentDto`). Sin contraseña: el estudiante la crea al activar su cuenta.
 * Empresas OPCIONALES desde el 17/11/2026 (lista vacía: el estudiante queda vinculado solo a quien lo registró).
 */
export interface RegisterStudentInput {
  firstNames: string;
  lastNames: string;
  email: string;
  dni: string;
  whatsapp?: string;
  companyIds?: string[];
  /**
   * Empresa por razón social y RUC (20/11/2026). El servidor reutiliza la empresa activa con ese RUC o la registra si
   * no existe; si está desactivada responde 409 (no la duplica ni la reactiva).
   */
  company?: { name: string; ruc: string };
}

/**
 * Resultado del envío del enlace de activación (`ActivationSummaryDto`):
 * - SENT: el proveedor de correo aceptó el mensaje (no garantiza que llegó);
 * - FAILED: el envío falló;
 * - NOT_CONFIGURED: el servidor no tiene proveedor de correo o falta ACTIVATION_URL. No se envió nada;
 * - DEV_CONSOLE: solo desarrollo local. NO se envió ningún correo: el enlace está en la consola del backend.
 */
export type EmailDelivery = 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'DEV_CONSOLE';

export interface ActivationSummary {
  status: 'PENDING';
  emailDelivery: EmailDelivery;
  /** Vencimiento del enlace emitido (ISO 8601). */
  expiresAt: string;
}

/** Respuesta de POST /students. Nunca incluye el enlace ni el token. */
export interface RegisterStudentResult {
  student: Student;
  activation: ActivationSummary;
  /** Solo si se indicó `company`: la empresa se registró (CREATED) o ya existía con ese RUC (REUSED). */
  companyOutcome?: 'CREATED' | 'REUSED';
}

/** Activación manual por WhatsApp (23/11/2026). La plataforma no sabe si el mensaje se envió o se entregó. */
export interface WhatsappActivation {
  status: 'LINK_GENERATED';
  whatsappUrl: string;
  expiresAt: string;
}

export interface ActivationStatus {
  activationPending: boolean;
  linkGeneratedAt: string | null;
  whatsappOpenedAt: string | null;
  expiresAt: string | null;
  linkState: 'VIGENTE' | 'VENCIDO' | 'USADO' | 'ANULADO' | 'SIN_ENLACE';
}

/** Tamaño de página del listado (el servidor admite de 1 a 100; su valor por defecto es 20). */
export const STUDENT_PAGE_SIZE = 20;
