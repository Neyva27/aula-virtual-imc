import { Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { VideoRecord } from '../../core/models/course.model';
import { isYouTubeId, parseYouTubeId, youTubeEmbedUrl, youTubeWatchUrl } from '../../core/utils/youtube';
import { driveEmbedUrl, driveViewUrl, isDriveFileId, parseDriveFileId } from '../../core/utils/drive';

/** Tiempo tras el cual se sugiere el enlace de respaldo si el reproductor no termina de cargar. */
const SLOW_MS = 15_000;

/**
 * Reproductor del aula. YouTube y Google Drive son soluciones PROVISIONALES (PENDIENTES M4 y S8): se integran con
 * un iframe (YouTube en modo de privacidad mejorada; Drive con su visor), sin cargar scripts de terceros en la aplicación.
 * No registra el avance: el alumno marca el video como visto (el control real va en el backend, V6).
 */
@Component({
  selector: 'app-video-player',
  template: `
    <div class="player">
      @if (youtubeId(); as id) {
        @if (online()) {
          <iframe
            class="frame"
            [src]="embedUrl()"
            [title]="'Video: ' + video().title"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            (load)="loaded.set(true)"
          ></iframe>
          @if (!loaded()) {
            <div class="state" role="status">
              <span class="spinner" aria-hidden="true"></span>
              <p>Cargando el reproductor…</p>
            </div>
          }
        } @else {
          <div class="state" role="status">
            <span class="icon" aria-hidden="true">⚠</span>
            <p>Sin conexión a internet</p>
            <small>El video se mostrará cuando vuelva la conexión.</small>
          </div>
        }
      } @else if (driveId(); as id) {
        @if (online()) {
          <iframe
            class="frame"
            [src]="driveEmbed()"
            [title]="'Video: ' + video().title"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            (load)="loaded.set(true)"
          ></iframe>
          @if (!loaded()) {
            <div class="state" role="status">
              <span class="spinner" aria-hidden="true"></span>
              <p>Cargando el reproductor…</p>
            </div>
          }
        } @else {
          <div class="state" role="status">
            <span class="icon" aria-hidden="true">⚠</span>
            <p>Sin conexión a internet</p>
            <small>El video se mostrará cuando vuelva la conexión.</small>
          </div>
        }
      } @else if (externalUrl(); as url) {
        <div class="state">
          <span class="icon" aria-hidden="true">↗</span>
          <p>Este video está alojado fuera de la plataforma</p>
          <a class="btn btn-secondary" [href]="url" target="_blank" rel="noopener noreferrer">
            Abrir el video<span class="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
        </div>
      } @else {
        <div class="state" role="status">
          <span class="icon" aria-hidden="true">▶</span>
          <p>{{ unavailable() }}</p>
        </div>
      }
    </div>

    @if (youtubeId(); as id) {
      @if (slow() && !loaded() && online()) {
        <p class="alert alert-warning small" role="status">
          El reproductor está tardando en cargar. Revisa tu conexión o abre el video en YouTube.
        </p>
      }
      <p class="small muted help">
        ¿No se reproduce?
        <a [href]="watchUrl(id)" target="_blank" rel="noopener noreferrer">
          Ver en YouTube<span class="sr-only"> (se abre en una pestaña nueva)</span>
        </a>.
        Algunos videos no permiten la reproducción integrada en otros sitios.
      </p>
    }
    @if (driveId(); as id) {
      @if (slow() && !loaded() && online()) {
        <p class="alert alert-warning small" role="status">
          El reproductor está tardando en cargar. Revisa tu conexión o abre el video en Google Drive.
        </p>
      }
      <!-- La página no puede saber si Drive negó el acceso (iframe de otro dominio): el aviso se muestra siempre. -->
      <p class="small muted help">
        Video alojado en Google Drive. Si no se reproduce o Drive pide permiso, el archivo puede no estar compartido
        para «Cualquier persona con el enlace» o seguir en procesamiento.
        <a [href]="driveUrl(id)" target="_blank" rel="noopener noreferrer">
          Abrir en Google Drive<span class="sr-only"> (se abre en una pestaña nueva)</span>
        </a>.
      </p>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .player {
        position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--radius);
        background: linear-gradient(135deg, #0a1e50, #12307a); color: #fff;
      }
      .frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      .state {
        position: absolute; inset: 0; display: grid; place-content: center; justify-items: center;
        gap: 0.4rem; padding: 1rem; text-align: center; background: linear-gradient(135deg, #0a1e50, #12307a);
      }
      .state p { margin: 0; font-weight: 700; max-width: 42ch; }
      .state small { color: #c5d0f0; }
      .icon {
        display: inline-grid; place-items: center; width: 56px; height: 56px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.18); font-size: 1.4rem;
      }
      .state .btn { margin-top: 0.4rem; }
      .spinner {
        width: 40px; height: 40px; border-radius: 50%; border: 4px solid rgba(255, 255, 255, 0.25);
        border-top-color: #fff; animation: spin 0.9s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
      .help { margin: 0.5rem 0 0; }
      .alert { margin: 0.5rem 0 0; }
    `,
  ],
})
export class VideoPlayer {
  private readonly sanitizer = inject(DomSanitizer);

  readonly video = input.required<VideoRecord>();

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  /** Se reinician al cambiar de video. */
  readonly loaded = linkedSignal({ source: this.video, computation: () => false });
  readonly slow = linkedSignal({ source: this.video, computation: () => false });

  /** YouTube como fuente directa o como enlace guardado (por ejemplo, desde la administración). */
  readonly youtubeId = computed(() => {
    const s = this.video().source;
    if (s.kind === 'youtube') return isYouTubeId(s.videoId) ? s.videoId : null;
    return s.kind === 'url' ? parseYouTubeId(s.url) : null;
  });
  /** Solo se construye una URL confiable a partir de un identificador validado. */
  readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const id = this.youtubeId();
    return id ? this.sanitizer.bypassSecurityTrustResourceUrl(youTubeEmbedUrl(id)) : null;
  });
  /** Google Drive como fuente directa o como enlace guardado antes de M4 (fuente «url»). */
  readonly driveId = computed(() => {
    const s = this.video().source;
    if (s.kind === 'drive') return isDriveFileId(s.fileId) ? s.fileId : null;
    return s.kind === 'url' && !this.youtubeId() ? parseDriveFileId(s.url) : null;
  });
  readonly driveEmbed = computed<SafeResourceUrl | null>(() => {
    const id = this.driveId();
    return id ? this.sanitizer.bypassSecurityTrustResourceUrl(driveEmbedUrl(id)) : null;
  });
  /** Enlace https que no es de YouTube ni de Drive: no se integra, se ofrece abrirlo aparte. */
  readonly externalUrl = computed(() => {
    const s = this.video().source;
    return s.kind === 'url' && !this.youtubeId() && !this.driveId() && /^https:\/\/\S+$/i.test(s.url) ? s.url : null;
  });
  readonly unavailable = computed(() => {
    const s = this.video().source;
    if (s.kind === 'placeholder') {
      return 'Video de demostración sin archivo de reproducción. El contenido real lo incorporará la empresa.';
    }
    return 'El enlace de este video no es válido. Comunícate con la empresa.';
  });

  readonly watchUrl = youTubeWatchUrl;
  readonly driveUrl = driveViewUrl;

  constructor() {
    const setOnline = () => this.online.set(true);
    const setOffline = () => this.online.set(false);
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    });

    effect((onCleanup) => {
      if ((!this.youtubeId() && !this.driveId()) || !this.online() || this.loaded()) return;
      const timer = setTimeout(() => this.slow.set(true), SLOW_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
