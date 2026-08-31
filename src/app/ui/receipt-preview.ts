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
            {{ i18n.formatNumber(liters(), { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }} L ×
            {{ i18n.formatNumber(unitPrice()!, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) }}/L
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
      background: var(--well);
      border: 1px solid var(--hairline);
      box-shadow: var(--well-inset);
    }
    .receipt-line--total strong {
      font-variant-numeric: tabular-nums;
      font-size: 1.25rem;
    }
    .receipt__hint {
      margin: 0;
      color: var(--muted);
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
    const locale = this.i18n.language() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency(),
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${this.i18n.formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`;
    }
  }
}
