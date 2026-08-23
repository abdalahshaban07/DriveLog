import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Db } from '../../data/db';
import { monthFuelSpend, overallLitersPer100Km, latestEconomy } from '../../domain/economy';
import { costPerKmTrend, spendByMonth } from '../../domain/insights';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { Sparkline } from '../../ui/charts/sparkline';

@Component({
  selector: 'app-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, Sparkline, DecimalPipe, RouterLink],
  templateUrl: './insights.html',
  styleUrl: './insights.scss',
})
export class InsightsPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly period = signal<'3m' | '6m' | '12m' | 'all'>('6m');
  readonly periodOptions: { id: '3m' | '6m' | '12m' | 'all'; labelKey: 'insights.period3m' | 'insights.period6m' | 'insights.period12m' | 'insights.periodAll' }[] = [
    { id: '3m', labelKey: 'insights.period3m' },
    { id: '6m', labelKey: 'insights.period6m' },
    { id: '12m', labelKey: 'insights.period12m' },
    { id: 'all', labelKey: 'insights.periodAll' },
  ];

  readonly economy = computed(() => latestEconomy(this.db.fillUps()));
  readonly overallL100 = computed(() => overallLitersPer100Km(this.db.fillUps()));
  readonly monthSpend = computed(() => monthFuelSpend(this.db.fillUps()));
  readonly costTrend = computed(() => costPerKmTrend(this.db.fillUps(), this.period()));
  readonly spendTrend = computed(() => spendByMonth(this.db.fillUps(), this.period()));

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${value} ${this.db.settings().currency}`;
    }
  }

  setPeriod(p: '3m' | '6m' | '12m' | 'all'): void {
    this.period.set(p);
  }
}
