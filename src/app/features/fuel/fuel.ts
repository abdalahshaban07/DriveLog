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

  readonly lastFill = computed(() => {
    const sorted = [...this.db.fillUps()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    return sorted[0] ?? null;
  });

  gradeLabel(grade: FuelGrade): string {
    const keys: Record<FuelGrade, MsgKey> = {
      gasoline92: 'fillUp.grade.gasoline92',
      gasoline95: 'fillUp.grade.gasoline95',
      diesel: 'fillUp.grade.diesel',
      solar: 'fillUp.grade.solar',
      custom: 'fillUp.grade.custom',
    };
    return this.i18n.t(keys[grade]);
  }

  constructor() {
    void this.loadTip();
  }

  formatMoney(value: number): string {
    const locale = this.i18n.language() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${this.i18n.formatNumber(value)} ${this.db.settings().currency}`;
    }
  }

  formatMetric(value: number | null, suffix: string): string {
    if (value == null || !Number.isFinite(value)) {
      return '—';
    }
    return `${this.i18n.formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${suffix}`;
  }

  async loadTip(): Promise<void> {
    this.tipBusy.set(true);
    try {
      const lang = this.i18n.language();
      const reply = await fetchFuelTip(this.db, lang, (k) => this.i18n.t(k as MsgKey));
      this.tip.set(reply.text);
      this.tipSource.set(reply.source);
    } finally {
      this.tipBusy.set(false);
    }
  }
}
