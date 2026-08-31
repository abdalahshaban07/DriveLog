import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { filterFillUps, fillUpsToCsv } from '../../domain/export-csv';
import { previousFillForCar } from '../../domain/fill-up-distance';
import type { FillUp, FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';

type GradeFilter = FuelGrade | 'all';

@Component({
  selector: 'app-fill-up-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, DateField],
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

  readonly groupedRows = computed(() => {
    const groups = new Map<string, FillUp[]>();
    for (const row of this.rows()) {
      const month = row.date.slice(0, 7);
      const bucket = groups.get(month) ?? [];
      bucket.push(row);
      groups.set(month, bucket);
    }
    return [...groups.entries()].map(([month, items]) => ({ month, items }));
  });

  gradeLabel(grade?: string): string {
    if (!grade) {
      return '';
    }
    const key = `fillUp.grade.${grade}` as MsgKey;
    return this.i18n.t(key);
  }

  monthLabel(month: string): string {
    const [y, mo] = month.split('-').map(Number);
    try {
      return new Intl.DateTimeFormat(this.i18n.language() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB', {
        month: 'long',
        year: 'numeric',
      }).format(new Date(y!, mo! - 1, 1));
    } catch {
      return month;
    }
  }

  datePill(date: string): string {
    return this.i18n.formatDate(date, { day: 'numeric', month: 'short' });
  }

  kmDriven(f: FillUp): number | null {
    if (f.distanceKm != null && f.distanceKm > 0) {
      return f.distanceKm;
    }
    const carId = f.carId ?? this.db.car()?.id;
    if (!carId) {
      return null;
    }
    const prev = previousFillForCar(this.db.fillUps(), carId, f.id);
    if (!prev) {
      return null;
    }
    const d = f.odometer - prev.odometer;
    return d > 0 ? d : null;
  }

  kmDrivenLabel(f: FillUp): string | null {
    const km = this.kmDriven(f);
    if (km == null) {
      return null;
    }
    return this.i18n.t('history.kmDriven', {
      km: this.i18n.formatNumber(km, { maximumFractionDigits: 0 }),
    });
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
