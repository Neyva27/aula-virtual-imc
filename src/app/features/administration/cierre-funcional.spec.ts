import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { AdminCertificateImport, importFileError } from './admin-certificate-import';
import { AdminCourses } from './admin-courses';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';
import { certificateIdentity } from '../../core/services/certificate.service';
import { SUPPORT_CONFIG, supportWhatsappUrl } from '../../core/config/support.config';
import { buildCsv, csvCell } from '../../core/utils/csv-export';
import { courseLevelLabel } from '../../core/models/course.model';
import { Certificate } from '../../core/models/certificate.model';
import { ImportPreview } from '../../core/models/certificate-import.model';
import { cleanWhatsapp, isValidWhatsapp } from '../../core/models/student.model';
import { CertificateView } from '../certificates/certificate-view/certificate-view';
import { LevelBadge } from '../../shared/components/level-badge';
import { SupportButton } from '../../shared/components/support-button';

/** Cierre funcional (23/11/2026): soporte, WhatsApp, niveles, CSV seguro, certificado e importación masiva. */
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

@Component({ selector: 'app-host', imports: [LevelBadge], template: '<app-level-badge [level]="null" /><app-level-badge level="persona_competente" />' })
class BadgeHost {}

const CERT: Certificate = {
  id: 'c1', code: 'IMP-2026-0001', userId: 'u1', courseId: 'k1', attemptId: '', participantName: 'Ana Torres Quispe', participantFirstNames: 'Ana',
  participantLastNames: 'Torres Quispe', participantDni: '00000001', participantCompany: 'Empresa Ficticia', courseName: 'Curso', courseLevel: 'persona_autorizada',
  imported: true, approvalDate: null, issueDate: '2026-10-15', score: null, scaleMax: null, trainingHours: 8, entityName: 'IMC', status: 'vigente',
};

describe('Soporte por WhatsApp', () => {
  it('usa el enlace centralizado, abre otra pestaña, avisa que es provisional y no envía datos del usuario', async () => {
    const fixture = TestBed.createComponent(SupportButton);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[data-test="support-whatsapp"]')!;
    expect(link.getAttribute('href')).toBe(`https://wa.me/${SUPPORT_CONFIG.whatsappNumber}`);
    expect(link.getAttribute('href')).toBe(supportWhatsappUrl());
    expect(link.getAttribute('href')).not.toContain('?');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(text(link)).toContain('Contactar soporte');
    expect(text(link)).toContain('Número provisional');
  });
});

describe('WhatsApp del participante', () => {
  it('acepta celular peruano e internacional, y vacío (opcional)', () => {
    for (const v of ['987654321', '+51987654321', '+51 987-654-321', '(+1) 202 555 0100', '']) expect(isValidWhatsapp(v), v).toBe(true);
    expect(cleanWhatsapp('+51 987-654-321')).toBe('+51987654321');
  });
  it('rechaza números incorrectos', () => {
    for (const v of ['123', '812345678', '+0123456789', 'abc', '+5198765432112345']) expect(isValidWhatsapp(v), v).toBe(false);
  });
  it('la demostración guarda el número sin inventarlo y rechaza uno inválido', async () => {
    localStorage.clear();
    const repo = new MockDataRepository();
    repo.resetDemo();
    const saved = await new Promise<{ whatsapp?: string | null }>((ok, ko) =>
      repo.addParticipant({ fullName: 'Marta Rojas', email: 'marta@prueba.test', dni: '44556677', whatsapp: '987 654 321' }, []).subscribe({ next: ok, error: ko }),
    );
    expect(saved.whatsapp).toBe('987654321');
    const none = await new Promise<{ whatsapp?: string | null }>((ok, ko) =>
      repo.addParticipant({ fullName: 'Sin Numero', email: 'sin@prueba.test', dni: '44556678' }, []).subscribe({ next: ok, error: ko }),
    );
    expect(none.whatsapp).toBeUndefined();
    await expect(new Promise((ok, ko) => repo.addParticipant({ fullName: 'Mal Numero', email: 'mal@prueba.test', dni: '44556679', whatsapp: '123' }, []).subscribe({ next: ok, error: ko }))).rejects.toBeTruthy();
  });
});

describe('Niveles de curso', () => {
  it('muestra los nombres oficiales y «Pendiente de clasificación» sin nivel', async () => {
    expect(courseLevelLabel('persona_certificada')).toBe('Persona certificada');
    expect(courseLevelLabel(undefined)).toBe('Pendiente de clasificación');
    const fixture = TestBed.createComponent(BadgeHost);
    await fixture.whenStable();
    expect([...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-test="course-level"]')].map(text)).toEqual(['Pendiente de clasificación', 'Persona competente']);
  });

  it('el formulario ofrece exactamente tres niveles, guarda el elegido y filtra el listado', async () => {
    localStorage.clear();
    new MockDataRepository().resetDemo();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: DataRepository, useClass: MockDataRepository }] });
    const fixture = TestBed.createComponent(AdminCourses);
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    for (let i = 0; i < 80 && c.loading(); i++) {
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 25));
    }
    await fixture.whenStable();
    const total = c.rows().length;
    expect(c.rows().every((r) => !r.course.level)).toBe(true); // no se asigna nivel a los cursos existentes
    c.edit(c.rows()[0]);
    await fixture.whenStable();
    expect([...el.querySelectorAll('#c-level option')].map(text)).toEqual(['Pendiente de clasificación', 'Persona autorizada', 'Persona competente', 'Persona certificada']);
    c.form.controls.level.setValue('persona_competente');
    const id = c.rows()[0].course.id;
    c.save();
    for (let i = 0; i < 80 && c.rows().find((r) => r.course.id === id)?.course.level !== 'persona_competente'; i++) {
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(c.rows().find((r) => r.course.id === id)!.course.level).toBe('persona_competente');
    c.levelFilter.set('persona_competente');
    expect(c.visibleRows().map((r) => r.course.id)).toEqual([id]);
    c.levelFilter.set('pendiente');
    expect(c.visibleRows()).toHaveLength(total - 1);
  }, 30_000);
});

describe('CSV seguro', () => {
  it('neutraliza fórmulas y escapa separadores', () => {
    for (const v of ['=1+1', '+51', '-1', '@x']) expect(csvCell(v).startsWith("'")).toBe(true);
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('di "x"')).toBe('"di ""x"""');
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(buildCsv([['Ñ', 'b']]))).toBe('﻿Ñ;b\r\n');
  });
});

describe('Certificado con datos completos', () => {
  it('muestra DNI, empresa y nivel; un importado no inventa nota ni aprobación', async () => {
    const fixture = TestBed.createComponent(CertificateView);
    fixture.componentRef.setInput('cert', CERT);
    await fixture.whenStable();
    const all = text(fixture.nativeElement);
    expect(all).toContain('Ana Torres Quispe');
    expect(text((fixture.nativeElement as HTMLElement).querySelector('[data-test="identity"]'))).toBe('DNI: 00000001 · Empresa: Empresa Ficticia');
    expect(all).toContain('Nivel: Persona autorizada');
    expect(all).not.toContain('Nota:');
    expect(all).not.toContain('Fecha de aprobación');
  });

  it('un certificado histórico sin esos datos conserva su contenido y no los completa', async () => {
    const old: Certificate = { ...CERT, participantDni: undefined, participantCompany: undefined, courseLevel: undefined, imported: undefined, approvalDate: '2025-05-01', score: 15, scaleMax: 20, attemptId: 'a1' };
    expect(certificateIdentity(old)).toBe('');
    const fixture = TestBed.createComponent(CertificateView);
    fixture.componentRef.setInput('cert', old);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="identity"]')).toBeNull();
    expect(text(el)).toContain('Nota: 15 / 20');
    expect(text(el)).toContain('por haber aprobado el curso');
  });
});

describe('Importación masiva: pantalla', () => {
  const PREVIEW: ImportPreview = {
    fileName: 'datos.csv', format: 'CSV', fileHash: 'a'.repeat(64), total: 3, valid: 1, errors: 1, duplicates: 1, missingFields: { curso: 1 },
    rows: [
      { row: 2, status: 'valido', values: { nombres: 'Ana', apellidos: 'Torres', dni: '00000001', empresa: 'E', curso: 'C', codigo_certificado: 'X-0001', fecha_emision: '2026-10-15' }, issues: [] },
      { row: 3, status: 'error', values: { nombres: 'Luis', apellidos: 'Rojas', dni: '123', empresa: '', curso: '', codigo_certificado: 'X-0002', fecha_emision: '2026-10-15' }, issues: [{ row: 3, field: 'curso', message: 'Falta el curso.' }] },
      { row: 4, status: 'duplicado', values: { nombres: 'Ana', apellidos: 'Torres', dni: '00000001', empresa: 'E', curso: 'C', codigo_certificado: 'X-0001', fecha_emision: '2026-10-15' }, issues: [{ row: 4, field: 'codigo_certificado', message: 'El código está repetido en el archivo.' }] },
    ],
  };
  const RESULT = { id: 'i1', fileName: 'datos.csv', importedAt: '2026-11-23T15:00:00.000Z', actorName: 'Instructor Demo', total: 3, imported: 1, rejected: 1, duplicates: 1, issues: PREVIEW.rows.flatMap((r) => r.issues) };

  function setup(overrides: Record<string, unknown> = {}) {
    const api = {
      listCertificateImports: vi.fn(() => of([])),
      previewCertificateImport: vi.fn(() => of(PREVIEW)),
      confirmCertificateImport: vi.fn(() => of(RESULT)),
      certificateImportTemplate: vi.fn(),
      ...overrides,
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiDataRepository, useValue: api }] });
    const fixture = TestBed.createComponent(AdminCertificateImport);
    const el = fixture.nativeElement as HTMLElement;
    const choose = async (name = 'datos.csv') => {
      const input = el.querySelector<HTMLInputElement>('#imp-input')!;
      const file = new File(['x'], name);
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      Object.defineProperty(input, 'value', { configurable: true, writable: true, value: '' });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      return file;
    };
    const click = async (test: string) => {
      el.querySelector<HTMLElement>(`[data-test="${test}"]`)!.click();
      await fixture.whenStable();
    };
    return { api, fixture, el, choose, click };
  }

  it('valida formato y tamaño en el navegador', () => {
    expect(importFileError(new File(['x'], 'a.pdf'))).toContain('Formato no admitido');
    expect(importFileError(new File([], 'a.csv'))).toContain('vacío');
    expect(importFileError(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'a.xlsx'))).toContain('2 MB');
    expect(importFileError(new File(['x'], 'a.XLSX'))).toBe('');
  });

  it('muestra la vista previa con totales y errores por fila; sin confirmar no importa', async () => {
    const { api, fixture, el, choose, click } = setup();
    await fixture.whenStable();
    await choose();
    expect(api.previewCertificateImport).not.toHaveBeenCalled(); // seleccionar no procesa ni guarda
    await click('analyze');
    expect(text(el.querySelector('[data-test="total"]'))).toBe('3');
    expect(text(el.querySelector('[data-test="valid"]'))).toBe('1');
    expect(text(el.querySelector('[data-test="errors"]'))).toBe('1');
    expect(text(el.querySelector('[data-test="duplicates"]'))).toBe('1');
    expect(text(el.querySelector('[data-test="missing"]'))).toContain('curso: 1');
    expect(text(el.querySelector('tr[data-row="3"]'))).toContain('Falta el curso.');
    expect(el.querySelector<HTMLButtonElement>('[data-test="confirm"]')!.disabled).toBe(true);
    expect(api.confirmCertificateImport).not.toHaveBeenCalled();
  });

  it('confirma con la huella del archivo y presenta el resumen', async () => {
    const { api, fixture, el, choose, click } = setup();
    await fixture.whenStable();
    const file = await choose();
    await click('analyze');
    await click('accept');
    await click('confirm');
    expect(api.confirmCertificateImport).toHaveBeenCalledWith(file, PREVIEW.fileHash);
    const result = text(el.querySelector('[data-test="result"]'));
    expect(result).toContain('Importados: 1 · Rechazados: 1 · Duplicados: 1');
    expect(result).toContain('Instructor Demo');
    expect(el.querySelector('[data-test="preview"]')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#imp-input')!.value).toBe(''); // el mismo archivo se puede volver a elegir
  });

  it('muestra el error del servidor y no presenta un resultado', async () => {
    const { fixture, el, choose, click } = setup({ previewCertificateImport: vi.fn(() => throwError(() => new Error('El archivo está dañado.'))) });
    await fixture.whenStable();
    await choose();
    await click('analyze');
    expect(el.querySelector('[data-test="error"]')).not.toBeNull();
    expect(el.querySelector('[data-test="preview"]')).toBeNull();
    expect(el.querySelector('[data-test="result"]')).toBeNull();
  });
});
