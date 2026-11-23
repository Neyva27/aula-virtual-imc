import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminStudentsApi } from './admin-students-api';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import { Student } from '../../core/models/student.model';

/** Activación manual por WhatsApp (23/11/2026): se abre wa.me y nunca se afirma que el mensaje se envió. */
const URL_WA = 'https://wa.me/51987654321?text=hola';
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const student = (over: Partial<Student> = {}): Student => ({
  id: 's1', email: 'marta@prueba.test', firstNames: 'Marta', lastNames: 'Rojas', fullName: 'Marta Rojas', dni: '44556677', whatsapp: '987654321', active: true, activationPending: true, companies: [], ...over,
});

async function setup(s: Student, overrides: Record<string, unknown> = {}) {
  const api = {
    listStudents: vi.fn(() => of({ items: [s], total: 1, page: 1, pageSize: 20 })),
    listInstructorCompanies: vi.fn(() => of([])),
    getCourses: vi.fn(() => of([])),
    listEnrollments: vi.fn(() => of([])),
    prepareWhatsappActivation: vi.fn(() => of({ status: 'LINK_GENERATED', whatsappUrl: URL_WA, expiresAt: '2026-11-26T15:00:00.000Z' })),
    markWhatsappOpened: vi.fn(() => of({ activationPending: true, linkGeneratedAt: 'x', whatsappOpenedAt: 'x', expiresAt: 'x', linkState: 'VIGENTE' })),
    ...overrides,
  };
  TestBed.configureTestingModule({ providers: [{ provide: ApiDataRepository, useValue: api }] });
  const fixture = TestBed.createComponent(AdminStudentsApi);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { api, fixture, el, button: () => el.querySelector<HTMLButtonElement>('[data-test="send-whatsapp"]') };
}

describe('Activación por WhatsApp: pantalla', () => {
  afterEach(() => vi.restoreAllMocks());

  it('abre wa.me con el mensaje preparado, registra la apertura y no afirma que se envió', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const { api, fixture, el, button } = await setup(student());
    button()!.click();
    await fixture.whenStable();
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe(URL_WA);
    expect(api.markWhatsappOpened).toHaveBeenCalledWith('s1');
    const message = text(el.querySelector('[data-test="whatsapp-prepared"]'));
    expect(message).toContain('revisa el mensaje y pulsa enviar');
    expect(message).toContain('no se envía de forma automática');
  });

  it('si el navegador bloquea la pestaña no registra la apertura y ofrece el enlace', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { api, fixture, el, button } = await setup(student());
    button()!.click();
    await fixture.whenStable();
    expect(api.markWhatsappOpened).not.toHaveBeenCalled();
    expect(text(el.querySelector('[data-test="whatsapp-prepared"]'))).toContain('no abrió WhatsApp');
    expect(el.querySelector('[data-test="whatsapp-prepared"] a')!.getAttribute('href')).toBe(URL_WA);
  });

  it('si el servidor falla cierra la pestaña y muestra el error', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const { fixture, el, button } = await setup(student(), { prepareWhatsappActivation: vi.fn(() => throwError(() => new Error('fallo'))) });
    button()!.click();
    await fixture.whenStable();
    expect(tab.close).toHaveBeenCalled();
    expect(text(el.querySelector('[data-test="error"]'))).toContain('No se pudo generar el enlace');
  });

  it('sin número el botón queda deshabilitado; una cuenta activada no lo muestra', async () => {
    const none = await setup(student({ whatsapp: null }));
    expect(none.button()!.disabled).toBe(true);
    TestBed.resetTestingModule();
    const active = await setup(student({ activationPending: false }));
    expect(active.button()).toBeNull();
  });
});
