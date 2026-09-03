import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { buildMonthSpendDelta, isFlatDelta } from '../../../../domain/month-insight';
import type { Breakdown, FillUp, Maintenance, OtherExpense } from '../../../../domain/models';
import { I18n } from '../../../../i18n/i18n';

@Component({
  selector: 'app-month-insight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (delta(); as d) {
      <section
        class="month-insight"
        role="status"
        aria-live="polite"
        [attr.aria-label]="i18n.t('home.insight.title')"
        [class.month-insight--up]="!flat() && d.deltaPct > 0"
        [class.month-insight--down]="!flat() && d.deltaPct < 0"
      >
        <h3 class="month-insight__title">{{ i18n.t('home.insight.title') }}</h3>
        <p class="month-insight__text">{{ copy() }}</p>
      </section>
    }
  `,
  styles: `
    :host { display: block; margin-block-end: var(--space-4); }
    .month-insight {
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius);
      background: var(--metric-tint);
      border: 1px solid var(--hairline);
    }
    .month-insight--down { border-inline-start: 3px solid var(--ok); }
    .month-insight--up { border-inline-start: 3px solid var(--stop); }
    .month-insight__title {
      margin: 0 0 var(--space-1);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .month-insight__text { margin: 0; font-weight: 600; }
  `,
})
export class MonthInsight {
  readonly i18n = inject(I18n);
  readonly fills = input.required<readonly FillUp[]>();
  readonly maintenance = input.required<readonly Maintenance[]>();
  readonly breakdowns = input.required<readonly Breakdown[]>();
  readonly other = input.required<readonly OtherExpense[]>();
  readonly currency = input('EGP');

  readonly delta = computed(() =>
    buildMonthSpendDelta(
      this.fills(),
      this.maintenance(),
      this.breakdowns(),
      this.other(),
    ),
  );
  readonly flat = computed(() => {
    const d = this.delta();
    return d ? isFlatDelta(d.deltaPct) : true;
  });
  readonly copy = computed(() => {
    const d = this.delta();
    if (!d) return '';
    const pct = this.i18n.formatNumber(Math.abs(d.deltaPct), {
      maximumFractionDigits: 0,
    });
    const amount = this.formatMoney(d.current);
    if (this.flat()) {
      return this.i18n.t('home.insight.same', { pct, amount });
    }
    return d.deltaPct < 0
      ? this.i18n.t('home.insight.less', { pct, amount })
      : this.i18n.t('home.insight.more', { pct, amount });
  });

  private formatMoney(value: number): string {
    const locale = this.i18n.language() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency(),
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${this.i18n.formatNumber(value)} ${this.currency()}`;
    }
  }
}
