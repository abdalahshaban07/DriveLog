import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MotionPolicy } from './motion/motion-policy';
import { I18n } from '../i18n/i18n';

@Component({
  selector: 'app-receipt-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="receipt" role="status" aria-live="polite" [attr.aria-label]="i18n.t('fillUp.receipt')">
      @if (liters() > 0 && unitPrice() != null) {
        <div class="receipt-line">
          <span>
            {{ i18n.formatUnit(liters(), 'common.liters', 2) }} ×
            {{ i18n.formatUnit(unitPrice()!, 'common.perLiter', 3) }}
          </span>
        </div>
        <div class="receipt-line receipt-line--total" [class.metric-flash]="flash()">
          <span>{{ i18n.t('fillUp.total') }}</span>
          <strong>{{ formatMoney(displayTotal()) }}</strong>
        </div>
      } @else {
        <p class="receipt__hint">{{ i18n.t('fillUp.receiptHint') }}</p>
      }
    </div>
  `,
  styles: `
    .receipt {
      padding: var(--space-4);
      border-radius: calc(var(--radius) - 4px);
      background: color-mix(in srgb, var(--paper-text) 3%, var(--paper));
      color: var(--paper-text);
      border: 1px dashed color-mix(in srgb, var(--paper-muted) 38%, transparent);
    }
    .receipt-line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-3);
      font-size: 0.9rem;
      color: var(--paper-muted);
    }
    .receipt-line--total {
      margin-block-start: var(--space-2);
      padding-block-start: var(--space-3);
      border-block-start: 1px dashed color-mix(in srgb, var(--paper-muted) 40%, transparent);
      font-weight: 600;
      color: var(--paper-text);
    }
    .receipt-line--total strong {
      font-variant-numeric: tabular-nums;
      font-size: clamp(1.5rem, 6vw, 1.85rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.1;
      transition: opacity var(--motion-fast) var(--ease-out);
    }
    .receipt__hint {
      margin: 0;
      color: var(--paper-muted);
      font-size: 0.9rem;
    }
  `,
})
export class ReceiptPreview {
  readonly i18n = inject(I18n);
  private readonly policy = inject(MotionPolicy);

  readonly liters = input(0);
  readonly unitPrice = input<number | null>(null);
  readonly currency = input('EGP');
  readonly flash = signal(false);
  readonly displayTotal = signal(0);

  readonly total = computed(() => {
    const l = this.liters();
    const u = this.unitPrice();
    if (!Number.isFinite(l) || u == null) {
      return 0;
    }
    return Math.round(l * u * 100) / 100;
  });

  private debounceTimer = 0;

  constructor() {
    afterNextRender(() => {
      this.displayTotal.set(this.total());
    });
    effect(() => {
      const next = this.total();
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        void this.animateTotal(next);
      }, 300);
    });
  }

  private async animateTotal(target: number): Promise<void> {
    if (!this.policy.allowAnime('receipt')) {
      this.displayTotal.set(target);
      return;
    }
    const from = this.displayTotal();
    if (from === target) {
      return;
    }
    this.flash.set(true);
    window.setTimeout(() => this.flash.set(false), 220);
    try {
      const { animate } = await import('animejs');
      const state = { value: from };
      animate(state, {
        value: target,
        duration: 420,
        ease: 'out(3)',
        onUpdate: () => this.displayTotal.set(Math.round(state.value * 100) / 100),
        onComplete: () => this.displayTotal.set(target),
      });
    } catch {
      this.displayTotal.set(target);
    }
  }

  formatMoney(value: number): string {
    return this.i18n.formatMoney(value, this.currency(), 2);
  }
}
