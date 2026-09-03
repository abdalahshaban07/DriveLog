import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Scope } from 'animejs';
import { I18n } from '../../i18n/i18n';
import { createAnimeScope } from '../motion/anime-scope';
import { MotionPolicy } from '../motion/motion-policy';

const INNER_Y = 18;
const INNER_H = 84;

@Component({
  selector: 'app-fuel-tank-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (useFallback()) {
      <div class="tank-fallback" role="img" [attr.aria-label]="label()">
        <div class="tank-fallback__shell">
          <div class="tank-fallback__liquid" [style.height.%]="fillPct()">
            <div class="tank-fallback__wave" aria-hidden="true"></div>
          </div>
          <div class="tank-fallback__glass" aria-hidden="true"></div>
        </div>
        <span class="tank-fallback__pct">{{ pctLabel() }}</span>
      </div>
    } @else {
      <div #root class="tank-svg-wrap">
        <svg
          class="tank-svg"
          viewBox="0 0 160 120"
          role="img"
          [attr.aria-label]="label()"
          aria-hidden="false"
        >
          <defs>
            <clipPath id="tank-inner-clip">
              <rect x="28" y="18" width="104" height="84" rx="6" />
            </clipPath>
            <linearGradient id="tank-meniscus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--fuel)" stop-opacity="0.95" />
              <stop offset="55%" stop-color="var(--fuel)" stop-opacity="0.75" />
              <stop offset="100%" stop-color="var(--petrol-muted)" stop-opacity="0.9" />
            </linearGradient>
          </defs>
          <rect class="tank-shell" x="24" y="14" width="112" height="92" rx="10" />
          <rect class="tank-glass" x="26" y="16" width="48" height="70" rx="8" />
          <g clip-path="url(#tank-inner-clip)">
            <rect
              class="tank-liquid"
              x="28"
              [attr.y]="liquidY()"
              width="104"
              [attr.height]="liquidHeight()"
            />
            @if (liquidHeight() > 2) {
              <path
                class="tank-wave"
                [attr.d]="wavePath()"
              />
            }
          </g>
        </svg>
        <span class="tank-pct-overlay">{{ pctLabel() }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .tank-svg-wrap {
      position: relative;
      padding: var(--space-3);
      border-radius: calc(var(--radius) - 4px);
      background: var(--well);
      border: 1px solid var(--hairline);
    }
    .tank-svg {
      display: block;
      width: 100%;
      height: 7.5rem;
    }
    .tank-shell {
      fill: color-mix(in srgb, var(--petrol) 12%, var(--well));
      stroke: var(--petrol-muted);
      stroke-width: 2;
    }
    .tank-glass {
      fill: color-mix(in srgb, white 22%, transparent);
      pointer-events: none;
    }
    .tank-liquid {
      fill: url(#tank-meniscus);
    }
    .tank-wave {
      fill: color-mix(in srgb, var(--fuel) 85%, white);
      opacity: 0.55;
    }
    .tank-pct-overlay {
      position: absolute;
      inset-inline: 0;
      bottom: var(--space-3);
      text-align: center;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-size: 0.85rem;
      color: var(--muted);
      pointer-events: none;
    }
    .tank-fallback {
      display: grid;
      gap: var(--space-2);
      justify-items: center;
      padding: var(--space-3);
      border-radius: calc(var(--radius) - 4px);
      background: var(--well);
      border: 1px solid var(--hairline);
    }
    .tank-fallback__shell {
      position: relative;
      width: 4.5rem;
      height: 5.5rem;
      border: 2px solid var(--petrol-muted);
      border-radius: calc(var(--radius) - 6px);
      overflow: hidden;
      background: color-mix(in srgb, var(--petrol) 12%, var(--well));
    }
    .tank-fallback__liquid {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      overflow: hidden;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--fuel) 85%, white),
        color-mix(in srgb, var(--fuel) 70%, var(--petrol-muted)),
        var(--petrol-muted)
      );
      transition: height var(--motion-fast) var(--ease-out);
    }
    .tank-fallback__wave {
      position: absolute;
      inset-inline: -20%;
      top: -6px;
      height: 12px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--fuel) 75%, white);
      opacity: 0.6;
      animation: tank-wave 2.4s ease-in-out infinite;
    }
    .tank-fallback__glass {
      position: absolute;
      inset-block: 8% 12%;
      inset-inline-start: 8%;
      width: 38%;
      border-radius: calc(var(--radius) - 8px);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, white 35%, transparent),
        transparent 70%
      );
      pointer-events: none;
    }
    .tank-fallback__pct {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: var(--muted);
      font-size: 0.85rem;
    }
    @keyframes tank-wave {
      0%,
      100% {
        transform: translateX(-8%);
      }
      50% {
        transform: translateX(8%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tank-fallback__wave {
        animation: none;
      }
    }
  `,
})
export class FuelTankCanvas implements AfterViewInit {
  readonly liters = input(0);
  readonly tankCapacityLiters = input(50);

  private readonly i18n = inject(I18n);
  private readonly policy = inject(MotionPolicy);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rootRef = viewChild<ElementRef<HTMLDivElement>>('root');

  private animeScope: Scope | null = null;
  private animToken = 0;
  private wavePhase = signal(0);

  readonly fillRatio = computed(() => {
    const cap = Math.max(this.tankCapacityLiters(), 1);
    const ratio = this.liters() / cap;
    return Math.min(1, Math.max(0, ratio));
  });

  readonly fillPct = computed(() => Math.round(this.fillRatio() * 100));
  readonly displayedFill = signal(0);
  readonly pctLabel = computed(() =>
    `${this.i18n.formatNumber(this.fillPct(), { maximumFractionDigits: 0 })}%`,
  );

  readonly liquidHeight = computed(() => this.displayedFill() * INNER_H);
  readonly liquidY = computed(() => INNER_Y + INNER_H - this.liquidHeight());

  readonly wavePath = computed(() => {
    const y = this.liquidY();
    const phase = this.wavePhase();
    const amp = 2.2;
    const w = 104;
    const x0 = 28;
    const mid = x0 + w / 2;
    const c1x = x0 + w * 0.25 + Math.sin(phase) * 4;
    const c2x = x0 + w * 0.75 - Math.sin(phase) * 4;
    return `M${x0} ${y + amp} Q${c1x} ${y - amp} ${mid} ${y} T${x0 + w} ${y + amp} L${x0 + w} ${y + 8} L${x0} ${y + 8} Z`;
  });

  readonly label = computed(() =>
    this.i18n.t('fillUp.tankVisualLabel', {
      liters: this.liters(),
      pct: this.fillPct(),
    }),
  );
  readonly useFallback = signal(false);

  constructor() {
    this.useFallback.set(this.policy.prefersReducedMotion());
    effect(() => {
      const ratio = this.fillRatio();
      if (this.useFallback()) {
        this.displayedFill.set(ratio);
        return;
      }
      void this.animateFill(ratio);
    });
    if (!this.policy.prefersReducedMotion()) {
      this.startWaveLoop();
    }
  }

  ngAfterViewInit(): void {
    if (this.useFallback()) {
      return;
    }
    const root = this.rootRef()?.nativeElement;
    if (!root) {
      this.useFallback.set(true);
      return;
    }
    void createAnimeScope(root, this.destroyRef, this.policy, 'fuelTank').then((scope) => {
      this.animeScope = scope;
      if (!scope) {
        this.useFallback.set(true);
      }
    });
  }

  private startWaveLoop(): void {
    let raf = 0;
    const loop = () => {
      this.wavePhase.update((p) => p + 0.06);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    this.destroyRef.onDestroy(() => cancelAnimationFrame(raf));
  }

  private async animateFill(target: number): Promise<void> {
    const token = ++this.animToken;
    const from = this.displayedFill();
    if (from === target) {
      return;
    }
    if (!this.policy.allowAnime('fuelTank')) {
      this.displayedFill.set(target);
      return;
    }
    try {
      const { animate } = await import('animejs');
      const state = { fill: from };
      const opts = {
        fill: target,
        duration: 480,
        ease: 'out(3)',
        onUpdate: () => {
          if (token === this.animToken) {
            this.displayedFill.set(state.fill);
          }
        },
        onComplete: () => {
          if (token === this.animToken) {
            this.displayedFill.set(target);
          }
        },
      };
      if (this.animeScope) {
        this.animeScope.execute(() => animate(state, opts));
      } else {
        animate(state, opts);
      }
    } catch {
      this.displayedFill.set(target);
    }
  }
}
