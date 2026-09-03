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
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { dir: 'ltr' },
  template: `
    @if (values().length >= 1) {
      <svg
        class="bar-chart"
        [class.bar-chart--draw]="draw()"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        [attr.aria-label]="label()"
      >
        @for (tick of yTicks(); track tick) {
          <g class="bar-chart__tick">
            <line
              class="bar-chart__grid"
              [attr.x1]="plotLeft"
              [attr.x2]="width - padRight"
              [attr.y1]="yScale()(tick)"
              [attr.y2]="yScale()(tick)"
            />
            <text
              class="bar-chart__tick-label"
              [attr.x]="plotLeft - 4"
              [attr.y]="yScale()(tick)"
              text-anchor="end"
              dominant-baseline="middle"
            >
              {{ formatTick(tick) }}
            </text>
          </g>
        }
        @for (bar of bars(); track bar.i) {
          <rect
            class="bar-chart__bar"
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.w"
            [attr.height]="bar.h"
            rx="2"
          />
          @if (bar.label) {
            <text
              class="bar-chart__x-label"
              [attr.x]="bar.x + bar.w / 2"
              [attr.y]="height - 4"
              text-anchor="middle"
            >
              {{ bar.label }}
            </text>
          }
        }
      </svg>
    } @else {
      <div class="bar-chart bar-chart--empty" [attr.aria-label]="label()"></div>
    }
  `,
  styles: `
    :host {
      display: block;
      direction: ltr;
    }
    .bar-chart {
      display: block;
      width: 100%;
      height: 9rem;
    }
    .bar-chart__grid {
      stroke: var(--hairline);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .bar-chart__tick-label,
    .bar-chart__x-label {
      fill: var(--muted);
      font-size: 9px;
      font-variant-numeric: tabular-nums;
    }
    .bar-chart__bar {
      fill: var(--fuel);
      transform-box: fill-box;
      transform-origin: bottom center;
      scale: 1 0;
    }
    .bar-chart--draw .bar-chart__bar {
      animation: bar-grow var(--motion-slow, 0.55s) var(--ease-out, ease-out) forwards;
      animation-delay: calc(var(--i, 0) * 40ms);
    }
    @keyframes bar-grow {
      to {
        scale: 1 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar-chart__bar {
        scale: 1 1;
        animation: none;
      }
    }
    .bar-chart--empty {
      height: 9rem;
      border-radius: calc(var(--radius) - 8px);
      background: var(--well);
    }
  `,
})
export class BarChart {
  readonly width = 280;
  readonly height = 144;
  readonly padLeft = 36;
  readonly padRight = 8;
  readonly padTop = 8;
  readonly padBottom = 22;
  readonly plotLeft = this.padLeft;
  readonly values = input<number[]>([]);
  readonly labels = input<string[]>([]);
  readonly label = input('');
  readonly draw = signal(false);

  private readonly i18n = inject(I18n);
  private readonly policy = inject(MotionPolicy);

  constructor() {
    afterNextRender(() => {
      if (this.policy.allowAnime('barChart')) {
        void this.drawWithAnime();
      } else {
        this.draw.set(true);
      }
    });
  }

  readonly plotBottom = computed(() => this.height - this.padBottom);

  readonly yDomain = computed((): [number, number] => {
    const vals = this.values().filter((v) => Number.isFinite(v));
    if (!vals.length) {
      return [0, 1];
    }
    const max = Math.max(...vals, 0);
    return [0, max || 1];
  });

  readonly yScale = computed(() =>
    linearScale(this.yDomain(), [this.plotBottom(), this.padTop]),
  );

  readonly yTicks = computed(() => this.yScale().ticks().filter((t) => t >= 0));

  readonly bars = computed(() => {
    const vals = this.values();
    const lbls = this.labels();
    if (!vals.length) {
      return [];
    }
    const plotW = this.width - this.padLeft - this.padRight;
    const gap = 4;
    const barW = Math.max(4, (plotW - gap * (vals.length - 1)) / vals.length);
    const y0 = this.plotBottom();
    const scale = this.yScale();
    return vals.map((v, i) => {
      const h = Math.max(0, y0 - scale(v));
      return {
        i,
        x: this.padLeft + i * (barW + gap),
        y: scale(v),
        w: barW,
        h,
        label: lbls[i] ?? '',
      };
    });
  });

  formatTick(value: number): string {
    return this.i18n.formatNumber(value, { maximumFractionDigits: 0 });
  }

  private async drawWithAnime(): Promise<void> {
    try {
      const { animate, stagger } = await import('animejs');
      const bars = document.querySelectorAll('.bar-chart__bar');
      animate(bars, {
        scaleY: [0, 1],
        delay: stagger(40),
        duration: 480,
        ease: 'out(3)',
      });
      this.draw.set(true);
    } catch {
      this.draw.set(true);
    }
  }
}
