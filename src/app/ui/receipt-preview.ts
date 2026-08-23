import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { I18n } from '../i18n/i18n';

@Component({
  selector: 'app-receipt-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="receipt" role="status" aria-live="polite" [attr.aria-label]="i18n.t('fillUp.receipt')">
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
