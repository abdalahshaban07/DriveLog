import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';

@Component({
  selector: 'app-fill-up-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, DecimalPipe, RouterLink],
  templateUrl: './fill-up-history.html',
  styleUrl: './fill-up-history.scss',
})
export class FillUpHistoryPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly rows = computed(() =>
    [...this.db.fillUps()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  gradeLabel(grade?: string): string {
    if (!grade) {
      return '';
    }
    const key = `fillUp.grade.${grade}` as MsgKey;
    return this.i18n.t(key);
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

  unitPrice(f: { liters: number; cost: number; unitPrice?: number }): number | null {
    if (f.unitPrice != null) {
      return f.unitPrice;
    }
    if (f.liters > 0) {
      return Math.round((f.cost / f.liters) * 1000) / 1000;
    }
    return null;
  }
}
