import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Db } from '../../../../data/db';
import { countryFromCurrency } from '../../../../domain/country';
import { todayDateOnly } from '../../../../domain/dues';
import { sparklineGeometry } from '../../../../domain/fuel-dashboard';
import {
  changeEventKey,
  gradeTrend,
  lastFillImpact,
  latestChanges,
} from '../../../../domain/fuel-price-watch';
import type { WatchedGrade } from '../../../../domain/models';
import type { MsgKey } from '../../../../i18n/en';
import { I18n } from '../../../../i18n/i18n';

const GRADE_KEYS: Record<WatchedGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
};

@Component({
  selector: 'app-price-watch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './price-watch.html',
  styleUrl: './price-watch.scss',
})
export class PriceWatchCard {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  private readonly country = computed(() =>
    countryFromCurrency(this.db.settings().currency),
  );
  private readonly changes = computed(() =>
    latestChanges(this.db.fuelPriceHistory(), this.country(), todayDateOnly()),
  );
  private readonly eventKey = computed(() =>
    changeEventKey(this.country(), this.changes()),
  );
  readonly visible = computed(
    () =>
      this.changes().length > 0 &&
      this.eventKey() !== this.db.settings().priceAlertDismissedKey,
  );
  readonly sinceLabel = computed(() => {
    const day = this.changes()[0]?.day;
    return day ? this.i18n.t('priceWatch.since', { date: day }) : '';
  });
  readonly rows = computed(() => {
    const currency = this.db.settings().currency;
    const history = this.db.fuelPriceHistory();
    const cc = this.country();
    return this.changes().map((c) => {
      const label = this.i18n.t(GRADE_KEYS[c.grade]);
      return {
        grade: c.grade,
        label,
        from: this.i18n.formatMoney(c.from, currency, 2),
        to: this.i18n.formatMoney(c.to, currency, 2),
        up: c.delta > 0,
        deltaLabel: `${c.delta > 0 ? '+' : '−'}${this.i18n.formatNumber(Math.abs(c.pct), { maximumFractionDigits: 1 })}%`,
        trendLabel: this.i18n.t('priceWatch.trend', { grade: label }),
        spark: sparklineGeometry(gradeTrend(history, cc, c.grade), 72, 26),
      };
    });
  });
  readonly impactLine = computed((): string | null => {
    const currency = this.db.settings().currency;
    const impact = lastFillImpact(this.changes(), this.db.fillUps(), currency);
    if (!impact) {
      return null;
    }
    return this.i18n.t('priceWatch.lastFillLess', {
      grade: this.i18n.t(GRADE_KEYS[impact.grade]),
      amount: this.i18n.formatMoney(impact.amount, currency, 0),
    });
  });

  async dismiss(): Promise<void> {
    await this.db.updateSettings({ priceAlertDismissedKey: this.eventKey() });
  }
}