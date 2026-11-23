/**
 * Enlace «Saltar al contenido» (V5): lleva el foco al contenido principal (#contenido, con tabindex="-1").
 * Se gestiona a mano porque, dentro de la aplicación, el salto a «#contenido» no mueve el foco por sí solo.
 */
export function skipToContent(event: Event): void {
  const main = document.getElementById('contenido');
  if (!main) return;
  event.preventDefault();
  main.focus();
  main.scrollIntoView({ block: 'start' });
}
