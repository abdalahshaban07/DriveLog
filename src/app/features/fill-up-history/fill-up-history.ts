import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Db } from '../../data/db';
import { filterFillUps, fillUpsToCsv } from '../../domain/export-csv';
import type { FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';

type GradeFilter = FuelGrade | 'all';

@Component({
  selector: 'app-fill-up-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, DecimalPipe, RouterLink, DateField],
  templateUrl: './fill-up-history.html',
  styleUrl: './fill-up-history.scss',
})
export class FillUpHistoryPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly gradeFilter = signal<GradeFilter>('all');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly shareBusy = signal(false);
  readonly shareError = signal('');

  readonly gradeChips: { id: GradeFilter; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'history.filterAll' },
    { id: 'gasoline92', labelKey: 'fillUp.grade.gasoline92' },
    { id: 'gasoline95', labelKey: 'fillUp.grade.gasoline95' },
    { id: 'diesel', labelKey: 'fillUp.grade.diesel' },
    { id: 'solar', labelKey: 'fillUp.grade.solar' },
    { id: 'custom', labelKey: 'fillUp.grade.custom' },
  ];

  readonly rows = computed(() =>
    filterFillUps(this.db.fillUps(), {
      grade: this.gradeFilter(),
      from: this.fromDate() || undefined,
      to: this.toDate() || undefined,
    }).sort(
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

  setGrade(id: GradeFilter): void {
    this.gradeFilter.set(id);
  }

  async shareCsv(): Promise<void> {
    this.shareError.set('');
    const rows = this.rows();
    if (!rows.length) {
      return;
    }
    this.shareBusy.set(true);
    try {
      const csv = fillUpsToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const file = new File([blob], `drivelog-fill-ups-${new Date().toISOString().slice(0, 10)}.csv`, {
        type: 'text/csv',
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: this.i18n.t('history.shareTitle'),
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.shareError.set(this.i18n.t('history.shareFailed'));
    } finally {
      this.shareBusy.set(false);
    }
  }
}
