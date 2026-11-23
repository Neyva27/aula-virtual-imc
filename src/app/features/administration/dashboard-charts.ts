import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import { DashboardStats } from '../../core/models/admin.model';
import { Icon } from '../../shared/components/icon';
import { errMsg } from './admin-utils';

/** Serie del gráfico de actividad. Colores validados (CVD ΔE 21, contraste ≥ 3:1) en los matices corporativos. */
const SERIES = [
  { key: 'attempts', label: 'Evaluaciones rendidas', color: '#2f5bd3' },
  { key: 'certificates', label: 'Certificados emitidos', color: '#0f9d8f' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  listo_examen: 'Listo para examen',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  desaprobado: 'Desaprobado',
};

// Geometría del gráfico de actividad (unidades del viewBox).
const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 32 };

/**
 * Gráficos del Dashboard del Instructor (modo API), con los indicadores que calcula el servidor en MySQL
 * (`GET /dashboard`): actividad de 14 días, resultados, estado de las matrículas y actividad reciente.
 * Un solo eje por gráfico, leyenda, información al pasar el cursor y vista de tabla (accesibilidad).
 */
@Component({
  selector: 'app-dashboard-charts',
  imports: [Icon],
  template: `
    @if (error()) {
      <p class="alert alert-danger" role="alert">No se pudieron cargar los indicadores del servidor: {{ error() }}</p>
    } @else if (stats(); as s) {
      <div class="grid stats" data-test="kpis">
        <article class="card stat"><app-icon name="users" /><span>Participantes activos</span><strong>{{ s.participants.active }}</strong>
          <small class="muted">{{ s.participants.pendingActivation }} pendientes de activación · {{ s.participants.total }} en total</small></article>
        <article class="card stat"><app-icon name="book" /><span>Cursos publicados</span><strong>{{ s.courses.published }}</strong>
          <small class="muted">de {{ s.courses.total }} cursos ({{ s.courses.active }} activos)</small></article>
        <article class="card stat"><app-icon name="clipboard" /><span>Evaluaciones realizadas</span><strong>{{ s.evaluations.total }}</strong>
          <small class="muted">{{ s.evaluations.approved }} aprobadas · {{ s.evaluations.failed }} desaprobadas</small></article>
        <article class="card stat"><app-icon name="award" /><span>Certificados vigentes</span><strong>{{ s.certificates.issued }}</strong></article>
      </div>

      <div class="grid panels">
        <section class="card stack chart-card" aria-labelledby="activity-title">
          <h2 id="activity-title">Actividad de los últimos 14 días</h2>
          <ul class="legend" aria-label="Leyenda">
            @for (serie of series; track serie.key) {
              <li><span class="swatch" [style.background]="serie.color"></span>{{ serie.label }}</li>
            }
          </ul>
          <div class="plot">
            <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" role="img" [attr.aria-label]="activitySummary()" preserveAspectRatio="none">
              @for (tick of ticks(); track tick.value) {
                <line class="grid-line" [attr.x1]="pad.left" [attr.x2]="width - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
                <text class="axis" [attr.x]="pad.left - 6" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.value }}</text>
              }
              @for (bar of bars(); track bar.id) {
                <path [attr.d]="bar.d" [attr.fill]="bar.color" />
              }
              @for (day of days(); track day.date; let i = $index) {
                @if (i % 2 === 0) {
                  <text class="axis" [attr.x]="day.cx" [attr.y]="height - 8" text-anchor="middle">{{ day.label }}</text>
                }
                <rect class="hit" [attr.x]="day.x" [attr.y]="pad.top" [attr.width]="day.w" [attr.height]="height - pad.top - pad.bottom"
                  (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)" tabindex="0"
                  [attr.aria-label]="day.label + ': ' + day.attempts + ' evaluaciones, ' + day.certificates + ' certificados'" />
              }
            </svg>
            @if (hovered(); as h) {
              <div class="tooltip" role="status" [style.left.%]="h.leftPct">
                <strong>{{ h.label }}</strong>
                <span><span class="swatch" [style.background]="series[0].color"></span>{{ h.attempts }} evaluaciones</span>
                <span><span class="swatch" [style.background]="series[1].color"></span>{{ h.certificates }} certificados</span>
              </div>
            }
          </div>
          <details>
            <summary class="small">Ver como tabla</summary>
            <div class="table-wrap">
              <table>
                <caption class="sr-only">Actividad diaria</caption>
                <thead><tr><th scope="col">Fecha</th><th scope="col">Evaluaciones rendidas</th><th scope="col">Certificados emitidos</th></tr></thead>
                <tbody>
                  @for (d of s.activity; track d.date) { <tr><td>{{ d.date }}</td><td>{{ d.attempts }}</td><td>{{ d.certificates }}</td></tr> }
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section class="card stack" aria-labelledby="results-title">
          <h2 id="results-title">Resultados de las evaluaciones</h2>
          <ul class="hbars">
            @for (r of results(); track r.label) {
              <li>
                <span class="hbar-label"><app-icon [name]="r.icon" size="sm" /> {{ r.label }}</span>
                <span class="hbar-track"><span class="hbar" [style.width.%]="r.pct" [style.background]="r.color"></span></span>
                <span class="hbar-value">{{ r.value }}</span>
              </li>
            }
          </ul>
          <h3>Estado de las matrículas</h3>
          <ul class="hbars">
            @for (e of enrollmentBars(); track e.label) {
              <li>
                <span class="hbar-label">{{ e.label }}</span>
                <span class="hbar-track"><span class="hbar" [style.width.%]="e.pct" [style.background]="series[0].color"></span></span>
                <span class="hbar-value">{{ e.value }}</span>
              </li>
            }
          </ul>
        </section>
      </div>

      <section class="card stack" aria-labelledby="recent-title">
        <h2 id="recent-title">Actividad reciente</h2>
        @if (s.recent.length === 0) {
          <p class="muted">Todavía no hay evaluaciones ni certificados.</p>
        } @else {
          <ul class="recent">
            @for (r of s.recent; track $index) {
              <li>
                <app-icon [name]="r.type === 'certificado' ? 'award' : r.inReview ? 'clock' : r.passed ? 'check-circle' : 'x-circle'" size="sm" />
                <span><strong>{{ name(r.studentId) }}</strong> ·
                  {{ r.type === 'certificado' ? 'obtuvo el certificado de' : r.inReview ? 'rindió (en revisión)' : r.passed ? 'aprobó' : 'desaprobó' }}
                  «{{ r.courseName }}»</span>
                <time class="small muted" [attr.datetime]="r.date">{{ when(r.date) }}</time>
              </li>
            }
          </ul>
        }
      </section>
    } @else {
      <p class="card muted" role="status">Cargando indicadores…</p>
    }
  `,
  styles: [
    `
      :host { display: grid; gap: var(--space-5, 1.25rem); }
      /* Mismas tarjetas que el Dashboard (sus estilos están encapsulados en ese componente). */
      .stats { grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); }
      .stat { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-4); }
      .stat app-icon {
        display: grid; place-items: center; width: 36px; height: 36px; margin-bottom: var(--space-2);
        border-radius: var(--radius-pill); background: var(--c-primary-100); color: var(--c-primary);
      }
      .stat span { color: var(--c-muted); font-size: var(--text-sm); }
      .stat strong { font-size: var(--text-2xl); color: var(--c-primary); line-height: var(--leading-tight); }
      .stat small { font-size: var(--text-xs); }
      .panels { grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr); align-items: start; }
      @media (max-width: 1100px) { .panels { grid-template-columns: minmax(0, 1fr); } }
      .chart-card { position: relative; }
      .legend { display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; margin: 0; padding: 0; font-size: var(--text-sm); color: var(--c-muted); }
      .legend li, .tooltip span { display: inline-flex; align-items: center; gap: 0.4rem; }
      .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
      .plot { position: relative; }
      svg { width: 100%; height: 220px; display: block; }
      .grid-line { stroke: var(--c-border); stroke-width: 1; }
      .axis { fill: var(--c-muted); font-size: 11px; }
      .hit { fill: transparent; cursor: default; outline: none; }
      .hit:focus-visible { fill: rgba(47, 91, 211, 0.08); }
      .tooltip {
        position: absolute; top: 0; transform: translateX(-50%); display: grid; gap: 0.2rem; pointer-events: none;
        background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 0.4rem 0.6rem;
        box-shadow: 0 2px 8px rgba(10, 30, 80, 0.12); font-size: var(--text-sm); color: var(--c-text); white-space: nowrap;
      }
      .hbars { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
      .hbars li { display: grid; grid-template-columns: minmax(9rem, auto) 1fr 2.5rem; align-items: center; gap: 0.6rem; font-size: var(--text-sm); }
      .hbar-label { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--c-text); }
      .hbar-track { height: 10px; background: var(--c-bg); border-radius: 4px; overflow: hidden; }
      .hbar { display: block; height: 100%; border-radius: 0 4px 4px 0; min-width: 2px; }
      .hbar-value { text-align: right; font-weight: 600; color: var(--c-text); }
      h3 { margin: 0.5rem 0 0; font-size: 1rem; }
      .recent { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
      .recent li { display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; }
      @media (max-width: 700px) { .hbars li { grid-template-columns: 1fr 2.5rem; } .hbar-track { grid-column: 1 / -1; grid-row: 2; } }
    `,
  ],
})
export class DashboardCharts {
  private readonly api = inject(ApiDataRepository);

  readonly series = SERIES;
  readonly width = W;
  readonly height = H;
  readonly pad = PAD;
  readonly stats = signal<DashboardStats | null>(null);
  readonly error = signal('');
  readonly hover = signal<number | null>(null);
  private readonly names = signal<Map<string, string>>(new Map());

  constructor() {
    forkJoin({ stats: this.api.dashboard(), users: this.api.getUsers() }).subscribe({
      next: ({ stats, users }) => {
        this.names.set(new Map(users.map((u) => [u.id, u.fullName])));
        this.stats.set(stats);
      },
      error: (e: unknown) => this.error.set(errMsg(e)),
    });
  }

  private readonly max = computed(() => {
    const s = this.stats();
    const top = Math.max(1, ...(s?.activity ?? []).flatMap((d) => [d.attempts, d.certificates]));
    const step = Math.max(1, Math.ceil(top / 4));
    return step * 4;
  });

  readonly ticks = computed(() => {
    const max = this.max();
    return [0, 1, 2, 3, 4].map((i) => {
      const value = (max / 4) * i;
      return { value, y: this.y(value) };
    });
  });

  private y(value: number): number {
    return H - PAD.bottom - (value / this.max()) * (H - PAD.top - PAD.bottom);
  }

  readonly days = computed(() => {
    const activity = this.stats()?.activity ?? [];
    const w = (W - PAD.left - PAD.right) / Math.max(1, activity.length);
    return activity.map((d, i) => ({ ...d, x: PAD.left + i * w, w, cx: PAD.left + i * w + w / 2, label: d.date.slice(8, 10) + '/' + d.date.slice(5, 7) }));
  });

  /** Columnas agrupadas: 2 px de separación entre barras, extremo superior redondeado (4 px), anclado a la base. */
  readonly bars = computed(() => {
    const out: { id: string; d: string; color: string }[] = [];
    for (const day of this.days()) {
      const group = day.w * 0.7;
      const barW = (group - 2) / 2;
      SERIES.forEach((serie, s) => {
        const value = day[serie.key];
        if (!value) return;
        const x = day.x + (day.w - group) / 2 + s * (barW + 2);
        const top = this.y(value);
        const base = H - PAD.bottom;
        const r = Math.min(4, barW / 2, base - top);
        out.push({
          id: `${day.date}-${serie.key}`,
          color: serie.color,
          d: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`,
        });
      });
    }
    return out;
  });

  readonly hovered = computed(() => {
    const i = this.hover();
    const day = i === null ? null : this.days()[i];
    return day ? { ...day, leftPct: (day.cx / W) * 100 } : null;
  });

  readonly activitySummary = computed(() => {
    const a = this.stats()?.activity ?? [];
    const attempts = a.reduce((n, d) => n + d.attempts, 0);
    const certs = a.reduce((n, d) => n + d.certificates, 0);
    return `Actividad de los últimos 14 días: ${attempts} evaluaciones rendidas y ${certs} certificados emitidos.`;
  });

  /** Resultados con colores de ESTADO (siempre con icono y etiqueta, nunca solo color). */
  readonly results = computed(() => {
    const e = this.stats()?.evaluations;
    if (!e) return [];
    const total = Math.max(1, e.total);
    return [
      { label: 'Aprobadas', value: e.approved, icon: 'check-circle' as const, color: 'var(--c-success)', pct: (e.approved / total) * 100 },
      { label: 'Desaprobadas', value: e.failed, icon: 'x-circle' as const, color: 'var(--c-danger)', pct: (e.failed / total) * 100 },
      { label: 'En revisión', value: e.inReview, icon: 'clock' as const, color: 'var(--c-muted)', pct: (e.inReview / total) * 100 },
    ];
  });

  readonly enrollmentBars = computed(() => {
    const byStatus = this.stats()?.enrollments.byStatus ?? {};
    const max = Math.max(1, ...Object.values(byStatus));
    return Object.entries(STATUS_LABELS).map(([key, label]) => ({ label, value: byStatus[key] ?? 0, pct: ((byStatus[key] ?? 0) / max) * 100 }));
  });

  name(id: string): string {
    return this.names().get(id) ?? 'Participante';
  }

  when(iso: string): string {
    return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
