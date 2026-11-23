/** Importación masiva de certificados (23/11/2026): contrato de `/admin/certificate-imports`. */
export type ImportRowStatus = 'valido' | 'error' | 'duplicado';

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreviewRow {
  row: number;
  status: ImportRowStatus;
  values: Record<string, string>;
  issues: ImportIssue[];
}

export interface ImportPreview {
  fileName: string;
  format: 'XLSX' | 'CSV';
  fileHash: string;
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  missingFields: Record<string, number>;
  rows: ImportPreviewRow[];
}

export interface ImportResult {
  id: string;
  fileName: string;
  importedAt: string;
  actorName: string;
  total: number;
  imported: number;
  rejected: number;
  duplicates: number;
  issues: ImportIssue[];
}

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  format: 'XLSX' | 'CSV';
  actorName: string;
  importedAt: string;
  total: number;
  imported: number;
  rejected: number;
  duplicates: number;
}

export interface ImportTemplate {
  columns: string[];
  required: string[];
  levels: { value: string; label: string }[];
  limits: { maxBytes: number; maxRows: number };
  examples: string[][];
}
