import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../../../data/db';
import { estimateFuelRange } from '../../../../domain/fuel-range';
import { I18n } from '../../../../i18n/i18n';

@Component({
  selector: 'app-fuel-range',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './fuel-range.html',
  styleUrl: './fuel-range.scss',
})
export class FuelRangeCard {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly estimate = computed(() => {
    const car = this.db.car();
    return car ? estimateFuelRange(car, this.db.fillUps()) : null;
  });
  readonly kmLabel = computed(() => {
    const est = this.estimate();
    return est ? this.i18n.formatNumber(est.kmLeft, { maximumFractionDigits: 0 }) : '';
  });
  readonly daysLabel = computed(() => {
    const est = this.estimate();
    if (!est) {
      return '';
    }
    if (est.empty || est.daysLeft < 1) {
      return this.i18n.t('fuelRange.today');
    }
    const days = Math.round(est.daysLeft);
    if (days <= 1) {
      return this.i18n.t('fuelRange.day');
    }
    return this.i18n.t('fuelRange.days', {
      days: this.i18n.formatNumber(days, { maximumFractionDigits: 0 }),
    });
  });
  readonly pct = computed(() => Math.round((this.estimate()?.tankRatio ?? 0) * 100));
  readonly pctLabel = computed(() =>
    this.i18n.formatNumber(this.pct(), { maximumFractionDigits: 0 }),
  );
  readonly basis = computed(() => {
    const est = this.estimate();
    return est
      ? this.i18n.t('fuelRange.basis', { kmPerDay: est.kmPerDay, l100: est.l100 })
      : '';
  });
  readonly gaugeLabel = computed(() =>
    this.i18n.t('fuelRange.gauge', { pct: this.pctLabel() }),
  );
  readonly nudgeTitle = computed(() =>
    this.estimate()?.empty
      ? this.i18n.t('fuelRange.emptyTitle')
      : this.i18n.t('fuelRange.lowTitle'),
  );
  readonly nudgeBody = computed(() => {
    const est = this.estimate();
    if (!est) {
      return '';
    }
    if (est.empty) {
      return this.i18n.t('fuelRange.emptyBody');
    }
    const days = Math.round(est.daysLeft);
    return days <= 1
      ? this.i18n.t('fuelRange.lowBodyOne')
      : this.i18n.t('fuelRange.lowBody', {
          days: this.i18n.formatNumber(days, { maximumFractionDigits: 0 }),
        });
  });
}