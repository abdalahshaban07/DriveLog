import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
  afterNextRender,
} from '@angular/core';

@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length >= 2) {
      <svg
        class="spark"
        [class.spark--draw]="draw()"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="label()"
      >
        <polyline
          class="spark__line"
          fill="none"
          [attr.points]="polyline()"
        />
      </svg>
    } @else {
      <div class="spark spark--empty" [attr.aria-label]="label()"></div>
    }
  `,
  styles: `
    .spark {
      display: block;
      width: 100%;
      height: 3rem;
    }
    .spark__line {
      stroke: var(--fuel);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      stroke-dasharray: 280;
      stroke-dashoffset: 280;
    }
    .spark--draw .spark__line {
      animation: spark-draw var(--motion-slow, 0.55s) var(--ease-out, ease-out) forwards;
    }
    @keyframes spark-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spark__line {
        stroke-dashoffset: 0;
        animation: none;
      }
    }
    .spark--empty {
      border-radius: calc(var(--radius) - 8px);
      background: var(--well);
    }
  `,
})
export class Sparkline {
  readonly width = 240;
  readonly height = 48;
  readonly values = input<number[]>([]);
  readonly label = input('');
  readonly draw = signal(false);

  constructor() {
    afterNextRender(() => this.draw.set(true));
  }

  readonly points = computed(() => this.values().filter((v) => Number.isFinite(v)));

  readonly polyline = computed(() => {
    const vals = this.points();
    if (vals.length < 2) {
      return '';
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const pad = 4;
    const w = this.width - pad * 2;
    const h = this.height - pad * 2;
    return vals
      .map((v, i) => {
        const x = pad + (i / (vals.length - 1)) * w;
        const y = pad + h - ((v - min) / span) * h;
        return `${x},${y}`;
      })
      .join(' ');
  });
}
