import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fetchFuelTip } from '../../data/assistant';
import { Db } from '../../data/db';
import { contextualFuelTipKey } from '../../domain/local-coach';
import { fuelDashboardMetrics } from '../../domain/fuel-dashboard';
import type { FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';

type GradeFilter = FuelGrade | 'all';

@Component({
  selector: 'app-fuel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink],
  templateUrl: './fuel.html',
  styleUrl: './fuel.scss',
})
export class FuelPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly grade = signal<GradeFilter>('all');
  readonly tip = signal('');
  readonly tipBusy = signal(false);
  readonly tipSource = signal<'ai' | 'local'>('local');

  readonly gradeOptions: { id: GradeFilter; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'fuel.gradeAll' },
    { id: 'gasoline92', labelKey: 'fillUp.grade.gasoline92' },
    { id: 'gasoline95', labelKey: 'fillUp.grade.gasoline95' },
    { id: 'diesel', labelKey: 'fillUp.grade.diesel' },
    { id: 'solar', labelKey: 'fillUp.grade.solar' },
  ];

  readonly metrics = computed(() =>
    fuelDashboardMetrics(this.db.fillUps(), this.grade()),
  );

  constructor() {
    void this.loadTip();
  }

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value} ${this.db.settings().currency}`;
    }
  }

  formatMetric(value: number | null, suffix: string): string {
    if (value == null || !Number.isFinite(value)) {
      return '—';
    }
    return `${value.toFixed(1)} ${suffix}`;
  }

  async loadTip(): Promise<void> {
    this.tipBusy.set(true);
    try {
      const lang = this.i18n.language();
      const fallback = this.i18n.t(contextualFuelTipKey(this.db));
      const text = await fetchFuelTip(this.db, lang, (k) => this.i18n.t(k as MsgKey));
      this.tip.set(text);
      this.tipSource.set(text.trim() === fallback.trim() ? 'local' : 'ai');
    } finally {
      this.tipBusy.set(false);
    }
  }
}
