import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminLiveSessions } from './admin-live-sessions';
import { DataRepository } from '../../core/services/data-repository';
import { MockDataRepository } from '../../core/services/mock-data-repository';

/** Clases en vivo (20/11/2026): sección propia de «Editar curso», con el repositorio de demostración. Datos ficticios. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'input') => {
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
};

async function setup() {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({ providers: [{ provide: DataRepository, useClass: MockDataRepository }] });
  const fixture = TestBed.createComponent(AdminLiveSessions);
  fixture.componentRef.setInput('courseId', 'c1');
  const el = fixture.nativeElement as HTMLElement;
  const repo = TestBed.inject(DataRepository);
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 160; i++) {
      await fixture.whenStable();
      if (cond()) return;
      await sleep(50);
    }
    throw new Error('La condición no se cumplió a tiempo');
  };
  await until(() => !!el.querySelector('[data-test="live-empty"]'));
  return { fixture, el, repo, until };
}

describe('Clases en vivo del curso (Instructor)', () => {
  it('programa una clase con módulo opcional, valida Meet, la edita, la cancela y la vuelve a programar', async () => {
    const { el, until, repo } = await setup();
    expect(text(el.querySelector('h2'))).toBe('Clases en vivo');
    button(el, 'Programar clase en vivo')!.click();
    await until(() => !!el.querySelector('form'));
    const tomorrow = new Date(Date.now() + 86_400_000 - 5 * 3_600_000).toISOString().slice(0, 10);
    setValue(el.querySelector<HTMLInputElement>('#ls-title')!, 'Repaso en vivo');
    setValue(el.querySelector<HTMLInputElement>('#ls-date')!, tomorrow);
    setValue(el.querySelector<HTMLInputElement>('#ls-time')!, '10:00');
    setValue(el.querySelector<HTMLInputElement>('#ls-meet')!, 'https://zoom.us/j/1');
    // El módulo es opcional: «Sin módulo (todo el curso)» viene elegido y también se puede elegir un módulo.
    const select = el.querySelector<HTMLSelectElement>('#ls-module')!;
    expect(text(select.options[0])).toBe('Sin módulo (todo el curso)');
    await until(() => select.options.length > 1);
    button(el, 'Programar clase')!.click();
    await until(() => text(el).includes('El enlace debe ser de Google Meet'));
    expect(await firstValueFrom(repo.getCourseLiveSessions('c1'))).toEqual([]);

    setValue(el.querySelector<HTMLInputElement>('#ls-meet')!, 'https://meet.google.com/abc-defg-hij');
    button(el, 'Programar clase')!.click();
    await until(() => !!el.querySelector('[data-live-session]'));
    let item = el.querySelector<HTMLElement>('[data-live-session]')!;
    expect(text(item)).toContain('Repaso en vivo');
    expect(text(item)).toContain('10:00 (hora de Lima)');
    expect(text(item)).toContain('Todo el curso (sin módulo)');
    expect(text(item)).toContain('Programada');
    const [saved] = await firstValueFrom(repo.getCourseLiveSessions('c1'));
    expect(saved).toMatchObject({ startsAt: `${tomorrow}T15:00:00.000Z`, moduleId: null }); // 10:00 de Lima = 15:00 UTC

    // Reprogramar: otra hora y un módulo.
    button(item, 'Editar o reprogramar Repaso en vivo')!.click();
    await until(() => !!el.querySelector('form'));
    setValue(el.querySelector<HTMLInputElement>('#ls-time')!, '18:30');
    setValue(el.querySelector<HTMLSelectElement>('#ls-module')!, 'c1-m1', 'change');
    button(el.querySelector('form')!, 'Guardar cambios')!.click();
    await until(() => text(el).includes('18:30'));
    item = el.querySelector<HTMLElement>('[data-live-session]')!;
    expect(text(item)).toContain('Módulo 1:');
    // Una clase futura no ofrece agregar grabación.
    expect(button(item, 'Grabación de Repaso en vivo')).toBeUndefined();

    button(item, 'Cancelar clase Repaso en vivo')!.click();
    await until(() => text(el.querySelector('[data-live-session]')).includes('Cancelada'));
    button(el, 'Volver a programar Repaso en vivo')!.click();
    await until(() => text(el.querySelector('[data-live-session]')).includes('Programada'));
  }, 30_000);

  it('agrega y quita la grabación de una clase ya realizada', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const prep = new MockDataRepository();
    await firstValueFrom(prep.createCourseLiveSession('c1', { title: 'Ya realizada', startsAt: new Date(Date.now() + 3_600_000).toISOString(), meetUrl: 'https://meet.google.com/abc-defg-hij' }));
    const key = Object.keys(localStorage).find((k) => k.startsWith('imc-demo-state'))!;
    const state = JSON.parse(localStorage.getItem(key)!);
    state.liveSessions[0].startsAt = new Date(Date.now() - 6 * 3_600_000).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
    TestBed.configureTestingModule({ providers: [{ provide: DataRepository, useClass: MockDataRepository }] });
    const f2 = TestBed.createComponent(AdminLiveSessions);
    f2.componentRef.setInput('courseId', 'c1');
    const el2 = f2.nativeElement as HTMLElement;
    const wait = async (cond: () => boolean) => {
      for (let i = 0; i < 160; i++) {
        await f2.whenStable();
        if (cond()) return;
        await sleep(50);
      }
      throw new Error('La condición no se cumplió a tiempo');
    };
    await wait(() => !!el2.querySelector('[data-live-session]'));
    expect(text(el2.querySelector('[data-live-session]'))).toContain('Finalizada');
    button(el2, 'Grabación de Ya realizada')!.click();
    await wait(() => !!el2.querySelector('#ls-recording'));
    setValue(el2.querySelector<HTMLInputElement>('#ls-recording')!, 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view');
    button(el2, 'Guardar grabación')!.click();
    await wait(() => text(el2).includes('Grabación guardada'));
    expect(el2.querySelector('[data-live-session] a[href^="https://drive.google.com"]')).not.toBeNull();
    button(el2, 'Grabación de Ya realizada')!.click();
    await wait(() => !!button(el2, 'Quitar grabación'));
    button(el2, 'Quitar grabación')!.click();
    await wait(() => text(el2).includes('Grabación quitada'));
    expect(el2.querySelector('[data-live-session] a[href^="https://drive.google.com"]')).toBeNull();
  }, 30_000);
});
