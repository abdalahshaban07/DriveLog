import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  afterNextRender,
} from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { MotionPolicy } from '../motion/motion-policy';
import { linearScale } from './scale';

@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { dir: 'ltr' },
  template: `
    @if (points().length >= 2) {
      <svg
        class="line-chart"
        [class.line-chart--draw]="draw()"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        [attr.aria-label]="label()"
      >
        @for (tick of yTicks(); track tick) {
          <g class="line-chart__tick">
            <line
              class="line-chart__grid"
              [attr.x1]="plotLeft"
              [attr.x2]="width - padRight"
              [attr.y1]="yScale()(tick)"
              [attr.y2]="yScale()(tick)"
            />
            <text
              class="line-chart__tick-label"
              [attr.x]="plotLeft - 4"
              [attr.y]="yScale()(tick)"
              text-anchor="end"
              dominant-baseline="middle"
            >
              {{ formatTick(tick) }}
            </text>
          </g>
        }
        @for (tick of xTicks(); track tick.i) {
          <text
            class="line-chart__x-label"
            [attr.x]="tick.x"
            [attr.y]="height - 4"
            text-anchor="middle"
          >
            {{ tick.label }}
          </text>
        }
        <polyline
          class="line-chart__line"
          fill="none"
          [attr.points]="polyline()"
        />
      </svg>
    } @else {
      <div class="line-chart line-chart--empty" [attr.aria-label]="label()"></div>
    }
  `,
  styles: `
    :host {
      display: block;
      direction: ltr;
    }
    .line-chart {
      display: block;
      width: 100%;
      height: 9rem;
    }
    .line-chart__grid {
      stroke: var(--hairline);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .line-chart__tick-label,
    .line-chart__x-label {
      fill: var(--muted);
      font-size: 9px;
      font-variant-numeric: tabular-nums;
    }
    .line-chart__line {
      stroke: var(--fuel);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      stroke-dasharray: 400;
      stroke-dashoffset: 400;
    }
    .line-chart--draw .line-chart__line {
      animation: line-draw var(--motion-slow, 0.55s) var(--ease-out, ease-out) forwards;
    }
    @keyframes line-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .line-chart__line {
        stroke-dashoffset: 0;
        animation: none;
      }
    }
    .line-chart--empty {
      height: 9rem;
      border-radius: calc(var(--radius) - 8px);
      background: var(--well);
    }
  `,
})
export class LineChart {
  readonly width = 280;
  readonly height = 144;
  readonly padLeft = 36;
  readonly padRight = 8;
  readonly padTop = 8;
  readonly padBottom = 22;
  readonly plotLeft = this.padLeft;
  readonly values = input<number[]>([]);
  readonly label = input('');
  readonly draw = signal(false);

  private readonly i18n = inject(I18n);
  private readonly policy = inject(MotionPolicy);

  constructor() {
    afterNextRender(() => {
      if (this.policy.allowAnime('lineChart')) {
        void this.drawWithAnime();
      } else {
        this.draw.set(true);
      }
    });
  }

  readonly plotBottom = computed(() => this.height - this.padBottom);

  readonly points = computed(() => this.values().filter((v) => Number.isFinite(v)));

  readonly yDomain = computed((): [number, number] => {
    const vals = this.points();
    if (vals.length < 2) {
      return [0, 1];
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.08 || 1;
    return [min - pad, max + pad];
  });

  readonly yScale = computed(() =>
    linearScale(this.yDomain(), [this.plotBottom(), this.padTop]),
  );

  readonly yTicks = computed(() => this.yScale().ticks());

  readonly xScale = computed(() => {
    const n = this.points().length;
    const plotW = this.width - this.padLeft - this.padRight;
    return linearScale([0, Math.max(1, n - 1)], [this.padLeft, this.padLeft + plotW]);
  });

  readonly xTicks = computed(() => {
    const vals = this.points();
    const n = vals.length;
    if (n < 2) {
      return [];
    }
    const scale = this.xScale();
    const picks =
      n <= 4
        ? vals.map((_, i) => i)
        : [0, Math.floor((n - 1) / 2), n - 1];
    return picks.map((i) => ({
      i,
      x: scale(i),
      label: String(i + 1),
    }));
  });

  readonly polyline = computed(() => {
    const vals = this.points();
    if (vals.length < 2) {
      return '';
    }
    const xScale = this.xScale();
    const yScale = this.yScale();
    return vals
      .map((v, i) => `${xScale(i)},${yScale(v)}`)
      .join(' ');
  });

  formatTick(value: number): string {
    return this.i18n.formatNumber(value, { maximumFractionDigits: 1 });
  }

  private async drawWithAnime(): Promise<void> {
    try {
      const { animate, createDrawable } = await import('animejs');
      const line = document.querySelector('.line-chart__line');
      if (!(line instanceof SVGPolylineElement)) {
        this.draw.set(true);
        return;
      }
      const drawable = createDrawable(line);
      animate(drawable, {
        draw: '0 1',
        duration: 550,
        ease: 'out(3)',
      });
      this.draw.set(true);
    } catch {
      this.draw.set(true);
    }
  }
}
