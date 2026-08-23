import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18n } from '../i18n/i18n';

@Component({
  selector: 'app-receipt-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div
      class="receipt"
      role="status"
      aria-live="polite"
      [attr.aria-label]="i18n.t('fillUp.receipt')"
    >
      @if (liters() > 0 && unitPrice() != null) {
        <div class="receipt-line">
          <span>{{ liters() | number: '1.0-2' }} L × {{ unitPrice() | number: '1.2-3' }}/L</span>
        </div>
        <div class="receipt-line receipt-line--total">
          <span>{{ i18n.t('fillUp.total') }}</span>
          <strong>{{ formatMoney(total()) }}</strong>
        </div>
      } @else {
        <p class="receipt__hint">{{ i18n.t('fillUp.receiptHint') }}</p>
      }
    </div>
  `,
  styles: `
    .receipt {
      padding: var(--space-4) var(--space-5);
      border-radius: calc(var(--radius) - 2px);
      background: var(--ink);
      color: var(--ink-text);
      border: 1px solid color-mix(in srgb, var(--ink-text) 8%, transparent);
    }
    .receipt-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-block: 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--ink-text) 12%, transparent);
      font-size: 0.9375rem;
      color: var(--ink-muted);
    }
    .receipt-line--total {
      border-bottom: 0;
      padding-block-start: var(--space-3);
      color: var(--ink-text);
    }
    .receipt-line--total span:first-child {
      font-size: var(--type-label);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
    }
    .receipt-line--total strong {
      font-variant-numeric: tabular-nums;
      font-size: clamp(1.5rem, 6vw, 1.875rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--fuel);
    }
    .receipt__hint {
      margin: 0;
      color: var(--ink-muted);
      font-size: 0.875rem;
    }
  `,
})
export class ReceiptPreview {
  readonly i18n = inject(I18n);
  readonly liters = input(0);
  readonly unitPrice = input<number | null>(null);
  readonly currency = input('EGP');
  readonly total = computed(() => {
    const l = this.liters();
    const u = this.unitPrice();
    if (!Number.isFinite(l) || u == null) {
      return 0;
    }
    return Math.round(l * u * 100) / 100;
  });

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.currency(),
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${this.currency()}`;
    }
  }
}
