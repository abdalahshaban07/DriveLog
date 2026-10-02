import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { linearScale } from './scale';

@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { dir: 'ltr' },
  template: `
    @if (points().length >= 1) {
      <svg
        class="line-chart"
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
        @if (refY() != null) {
          <line
            class="line-chart__ref"
            [attr.x1]="plotLeft"
            [attr.x2]="width - padRight"
            [attr.y1]="refY()"
            [attr.y2]="refY()"
          />
        }
        <polygon class="line-chart__area" [attr.points]="area()" />
        <polyline class="line-chart__line" fill="none" [attr.points]="polyline()" />
        @if (lastPoint(); as dot) {
          <circle class="line-chart__dot" [attr.cx]="dot.x" [attr.cy]="dot.y" r="3.5" />
        }
        @for (tick of xTicks(); track tick.i) {
          <text
            class="line-chart__x-label"
            [attr.x]="tick.x"
            [attr.y]="height - 4"
            [attr.text-anchor]="tick.anchor"
          >
            {{ tick.label }}
          </text>
        }
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
    .line-chart__area {
      fill: color-mix(in srgb, var(--fuel) 16%, transparent);
      stroke: none;
    }
    .line-chart__line {
      stroke: var(--fuel);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .line-chart__ref {
      stroke: var(--muted);
      stroke-width: 1;
      stroke-dasharray: 3 3;
      vector-effect: non-scaling-stroke;
    }
    .line-chart__dot {
      fill: var(--surface, var(--fill-surface));
      stroke: var(--fuel);
      stroke-width: 2;
    }
    .line-chart--empty {
      height: 9rem;
      border-radius: calc(var(--radius) - 8px);
      background: var(--fill-well);
    }
  `,
})
export class LineChart {
  readonly width = 280;
  readonly height = 144;
  readonly padLeft = 42;
  readonly padRight = 8;
  readonly padTop = 16;
  readonly padBottom = 22;
  readonly plotLeft = this.padLeft;
  readonly values = input<number[]>([]);
  readonly labels = input<string[]>([]);
  readonly reference = input<number | null>(null);
  readonly tickDigits = input(1);
  readonly label = input('');

  private readonly i18n = inject(I18n);

  readonly plotBottom = computed(() => this.height - this.padBottom);

  readonly points = computed(() => this.values().filter((v) => Number.isFinite(v)));

  readonly yDomain = computed((): [number, number] => {
    const vals = this.points();
    const ref = this.reference();
    const pool =
      ref != null && Number.isFinite(ref) ? [...vals, ref] : vals;
    if (!pool.length) {
      return [0, 1];
    }
    const min = Math.min(...pool);
    const max = Math.max(...pool);
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.08 || 1;
    return [min - pad, max + pad];
  });

  readonly yScale = computed(() =>
    linearScale(this.yDomain(), [this.plotBottom(), this.padTop]),
  );

  readonly yTicks = computed(() => {
    const scale = this.yScale();
    const lo = 8;
    const hi = this.plotBottom() + 1;
    return scale.ticks().filter((t) => scale(t) >= lo && scale(t) <= hi);
  });

  readonly xScale = computed(() => {
    const n = this.points().length;
    const plotW = this.width - this.padLeft - this.padRight;
    return linearScale([0, Math.max(1, n - 1)], [this.padLeft, this.padLeft + plotW]);
  });

  readonly coords = computed(() => {
    const vals = this.points();
    if (!vals.length) {
      return [];
    }
    const yScale = this.yScale();
    if (vals.length === 1) {
      const plotW = this.width - this.padLeft - this.padRight;
      return [{ x: this.padLeft + plotW / 2, y: yScale(vals[0]!) }];
    }
    const xScale = this.xScale();
    return vals.map((v, i) => ({ x: xScale(i), y: yScale(v) }));
  });

  readonly xTicks = computed(() => {
    const n = this.points().length;
    if (!n) {
      return [];
    }
    if (n === 1) {
      const dot = this.coords()[0];
      return [
        {
          i: 0,
          x: dot?.x ?? this.padLeft,
          anchor: 'middle',
          label:
            this.labels()[0] || this.i18n.formatNumber(1, { maximumFractionDigits: 0 }),
        },
      ];
    }
    const scale = this.xScale();
    const labels = this.labels();
    const picks =
      n <= 3 ? this.points().map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
    return picks.map((i) => ({
      i,
      x: scale(i),
      anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      label: labels[i] || this.i18n.formatNumber(i + 1, { maximumFractionDigits: 0 }),
    }));
  });

  readonly polyline = computed(() =>
    this.coords()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );

  readonly area = computed(() => {
    const pts = this.coords();
    if (pts.length < 2) {
      return '';
    }
    const y0 = this.plotBottom();
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    return `${first.x},${y0} ${pts.map((p) => `${p.x},${p.y}`).join(' ')} ${last.x},${y0}`;
  });

  readonly lastPoint = computed(() => this.coords().at(-1) ?? null);

  readonly refY = computed(() => {
    const ref = this.reference();
    if (ref == null || !Number.isFinite(ref) || this.points().length < 2) {
      return null;
    }
    return this.yScale()(ref);
  });

  formatTick(value: number): string {
    return this.i18n.formatNumber(value, {
      maximumFractionDigits: this.tickDigits(),
      minimumFractionDigits: 0,
    });
  }
}
