import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { MotionPolicy } from '../motion/motion-policy';

@Component({
  selector: 'app-tank-full-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="tank-full"
      role="switch"
      [attr.aria-checked]="value()"
      [attr.aria-label]="label()"
      (click)="toggle()"
      (keydown.enter)="toggle(); $event.preventDefault()"
      (keydown.space)="toggle(); $event.preventDefault()"
    >
      @if (useFallback) {
        <div class="tank-full__fallback" aria-hidden="true">
          <div class="tank-full__liquid" [class.tank-full__liquid--on]="value()"></div>
        </div>
      } @else {
        <canvas #canvas class="tank-full__canvas" aria-hidden="true"></canvas>
      }
      <span class="tank-full__caption">{{ value() ? onLabel() : offLabel() }}</span>
    </button>
  `,
  styles: `
    :host {
      display: block;
    }
    .tank-full {
      display: grid;
      gap: var(--space-2);
      width: 100%;
      margin: 0;
      padding: var(--space-3);
      border: 1px solid var(--hairline);
      border-radius: var(--radius);
      background: var(--surface);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: transform var(--motion-fast) var(--ease-out);
    }
    .tank-full:active {
      transform: scale(0.97);
    }
    .tank-full:focus-visible {
      outline: 2px solid var(--fuel);
      outline-offset: 2px;
    }
    .tank-full__canvas,
    .tank-full__fallback {
      display: block;
      width: 100%;
      height: 7.5rem;
      border-radius: calc(var(--radius) - var(--space-2));
    }
    .tank-full__fallback {
      position: relative;
      overflow: hidden;
      background: color-mix(in srgb, var(--petrol) 22%, var(--well));
      border: 1px solid var(--hairline);
    }
    .tank-full__liquid {
      position: absolute;
      inset-inline: 12%;
      bottom: 12%;
      height: 28%;
      border-radius: 0.4rem 0.4rem 0.2rem 0.2rem;
      background: color-mix(in srgb, var(--fuel) 70%, var(--petrol));
      transition: height 180ms var(--ease-out);
    }
    .tank-full__liquid--on {
      height: 72%;
    }
    .tank-full__caption {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    @media (prefers-reduced-motion: reduce) {
      .tank-full:active {
        transform: none;
      }
      .tank-full__liquid {
        transition: none;
      }
    }
  `,
})
export class TankFullCanvas implements AfterViewInit {
  private readonly policy = inject(MotionPolicy);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly value = model(false);
  readonly label = input.required<string>();
  readonly onLabel = input.required<string>();
  readonly offLabel = input.required<string>();

  readonly useFallback = this.policy.prefersReducedMotion();

  private raf = 0;
  private target = 0.28;
  private level = 0.28;
  private animating = false;

  constructor() {
    effect(() => {
      this.target = this.value() ? 0.72 : 0.28;
      if (this.useFallback) {
        this.level = this.target;
        return;
      }
      if (!this.animating) {
        this.level = this.target;
        this.draw();
      } else {
        this.kick();
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.useFallback) {
      return;
    }
    this.level = this.target;
    this.resize();
    this.draw();
    const onResize = () => {
      this.resize();
      this.draw();
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(this.raf);
    });
  }

  toggle(): void {
    this.animating = true;
    this.value.update((v) => !v);
  }

  private kick(): void {
    cancelAnimationFrame(this.raf);
    const step = () => {
      const delta = this.target - this.level;
      if (Math.abs(delta) < 0.004) {
        this.level = this.target;
        this.animating = false;
        this.draw();
        return;
      }
      this.level += delta * 0.22;
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private resize(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 120;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 120;
    const styles = getComputedStyle(canvas);
    const petrol = styles.getPropertyValue('--petrol').trim() || '#0f3d3e';
    const fuel = styles.getPropertyValue('--fuel').trim() || '#f5a623';
    const well = styles.getPropertyValue('--well').trim() || '#f4f7f7';
    const hair = styles.getPropertyValue('--hairline').trim() || '#d5dddd';

    ctx.clearRect(0, 0, w, h);
    const pad = 10;
    const rx = 14;
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, rx);
    ctx.fillStyle = colorMix(petrol, well, 0.22);
    ctx.fill();
    ctx.strokeStyle = hair;
    ctx.lineWidth = 1;
    ctx.stroke();

    const innerX = pad + 18;
    const innerY = pad + 14;
    const innerW = w - (pad + 18) * 2;
    const innerH = h - (pad + 14) * 2;
    const fillH = innerH * this.level;
    ctx.save();
    roundRect(ctx, innerX, innerY, innerW, innerH, 8);
    ctx.clip();
    ctx.fillStyle = colorMix(fuel, petrol, 0.35);
    ctx.fillRect(innerX, innerY + innerH - fillH, innerW, fillH);
    ctx.restore();

    ctx.strokeStyle = hair;
    roundRect(ctx, innerX, innerY, innerW, innerH, 8);
    ctx.stroke();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** ponytail: naive mix for canvas when CSS color-mix isn't available in 2d */
function colorMix(a: string, b: string, amountB: number): string {
  return `color-mix(in srgb, ${a} ${Math.round((1 - amountB) * 100)}%, ${b})`;
}
