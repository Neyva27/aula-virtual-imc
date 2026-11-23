import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';

/** V1: icono SVG propio, decorativo y accesible. */
@Component({
  imports: [Icon],
  template: `<button type="button" aria-label="Subir video"><app-icon name="arrow-up" /></button><app-icon name="check" size="sm" />`,
})
class Host {}

describe('Icon', () => {
  it('dibuja un SVG oculto a los lectores de pantalla, sin foco y con el trazo del icono', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [up, check] = [...(fixture.nativeElement as HTMLElement).querySelectorAll('svg')];
    expect(up.getAttribute('aria-hidden')).toBe('true');
    expect(up.getAttribute('focusable')).toBe('false');
    expect(up.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(up.classList).toContain('icon');
    expect(up.querySelector('path')!.getAttribute('d')).toBe('M12 19V5M5 12l7-7 7 7');
    expect(check.classList).toContain('icon--sm');
    // El nombre accesible lo da el control que contiene el icono.
    expect(up.closest('button')!.getAttribute('aria-label')).toBe('Subir video');
    expect(up.closest('button')!.textContent!.trim()).toBe('');
  });
});
