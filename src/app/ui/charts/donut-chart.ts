import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  afterNextRender,
} from '@angular/core';
import { MotionPolicy } from '../motion/motion-policy';

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { dir: 'ltr' },
  template: `
    @if (arcs().length) {
      <svg
        class="donut-chart"
        [class.donut-chart--draw]="draw()"
        [attr.viewBox]="'0 0 ' + size + ' ' + size"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        [attr.aria-label]="label()"
      >
        @for (arc of arcs(); track arc.i) {
          <circle
            class="donut-chart__seg"
            [attr.cx]="cx"
            [attr.cy]="cy"
            [attr.r]="radius"
            [attr.stroke]="arc.color"
            [attr.stroke-dasharray]="arc.dash"
            [attr.stroke-dashoffset]="draw() ? arc.offset : arc.hiddenOffset"
            fill="none"
            [attr.stroke-width]="stroke"
            pathLength="100"
          />
        }
      </svg>
      @if (legend().length) {
        <ul class="donut-chart__legend">
          @for (item of legend(); track item.label) {
            <li>
              <span class="donut-chart__swatch" [style.background]="item.color"></span>
              {{ item.label }} · {{ item.pct }}%
            </li>
          }
        </ul>
      }
    } @else {
      <div class="donut-chart donut-chart--empty" [attr.aria-label]="label()"></div>
    }
  `,
  styles: `
    :host {
      display: block;
      direction: ltr;
    }
    .donut-chart {
      display: block;
      width: 100%;
      max-width: 9rem;
      margin-inline: auto;
      height: auto;
    }
    .donut-chart__seg {
      transform-origin: center;
      transform: rotate(-90deg);
      stroke-dashoffset: 100;
    }
    .donut-chart--draw .donut-chart__seg {
      animation: donut-draw var(--motion-slow, 0.55s) var(--ease-out, ease-out) forwards;
      animation-delay: calc(var(--i, 0) * 50ms);
    }
    @keyframes donut-draw {
      to {
        stroke-dashoffset: var(--target-offset, 0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .donut-chart__seg {
        stroke-dashoffset: var(--target-offset, 0);
        animation: none;
      }
    }
    .donut-chart__legend {
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .donut-chart__legend li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-block-end: var(--space-1);
    }
    .donut-chart__swatch {
      flex: 0 0 0.6rem;
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 2px;
    }
    .donut-chart--empty {
      height: 9rem;
      border-radius: calc(var(--radius) - 8px);
      background: var(--well);
    }
  `,
})
export class DonutChart {
  readonly size = 120;
  readonly cx = this.size / 2;
  readonly cy = this.size / 2;
  readonly radius = 44;
  readonly stroke = 14;
  readonly slices = input<DonutSlice[]>([]);
  readonly label = input('');
  readonly draw = signal(false);

  private readonly policy = inject(MotionPolicy);

  private static readonly palette = [
    'var(--fuel)',
    'var(--cta)',
    'var(--petrol-muted)',
    'var(--mint)',
    'var(--stop)',
  ];

  constructor() {
    afterNextRender(() => {
      if (this.policy.allowAnime('donutChart')) {
        void this.drawWithAnime();
      } else {
        this.draw.set(true);
      }
    });
  }

  readonly total = computed(() =>
    this.slices().reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0),
  );

  readonly arcs = computed(() => {
    const total = this.total();
    if (total <= 0) {
      return [];
    }
    let cumulative = 0;
    return this.slices()
      .filter((s) => s.value > 0)
      .map((s, i) => {
        const pct = (s.value / total) * 100;
        const offset = 100 - cumulative;
        cumulative += pct;
        return {
          i,
          color: s.color ?? DonutChart.palette[i % DonutChart.palette.length]!,
          dash: `${pct} ${100 - pct}`,
          offset,
          hiddenOffset: offset + pct,
        };
      });
  });

  readonly legend = computed(() => {
    const total = this.total();
    if (total <= 0) {
      return [];
    }
    return this.slices()
      .filter((s) => s.value > 0)
      .map((s, i) => ({
        label: s.label,
        color: s.color ?? DonutChart.palette[i % DonutChart.palette.length]!,
        pct: Math.round((s.value / total) * 100),
      }));
  });

  private async drawWithAnime(): Promise<void> {
    try {
      const { animate, stagger } = await import('animejs');
      const segs = document.querySelectorAll('.donut-chart__seg');
      animate(segs, {
        strokeDashoffset: (_el, i) => this.arcs()[i]?.offset ?? 0,
        delay: stagger(50),
        duration: 520,
        ease: 'out(3)',
      });
      this.draw.set(true);
    } catch {
      this.draw.set(true);
    }
  }
}
