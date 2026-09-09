import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  filterFillUps,
  fillUpsToCsv,
  rangeBoundsForPreset,
  type HistoryRangePreset,
} from '../../domain/export-csv';
import { previousFillForCar } from '../../domain/fill-up-distance';
import { todayDateOnly } from '../../domain/dues';
import type { FillUp, FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';
import { SelectField } from '../../ui/select-field';

type GradeFilter = FuelGrade | 'all';

@Component({
  selector: 'app-fill-up-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, SectionTabs, RouterLink, DateField, SelectField, ConfirmBar],
  templateUrl: './fill-up-history.html',
  styleUrl: './fill-up-history.scss',
})
export class FillUpHistoryPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);

  readonly sectionTabs: SectionTab[] = [
    { labelKey: 'fillUp.title', link: '/fill-up' },
    { labelKey: 'section.history', link: '/history/fill-ups' },
  ];

  readonly gradeFilter = signal<GradeFilter>('all');
  readonly rangePreset = signal<HistoryRangePreset>('3months');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly shareBusy = signal(false);
  readonly shareError = signal('');
  readonly swipeId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);

  private swipeStartX = 0;
  private swipeActiveId: string | null = null;

  readonly rangePresets: { id: HistoryRangePreset; labelKey: MsgKey }[] = [
    { id: 'thisMonth', labelKey: 'history.rangeThisMonth' },
    { id: '3months', labelKey: 'history.range3Months' },
    { id: 'year', labelKey: 'history.rangeYear' },
    { id: 'custom', labelKey: 'history.rangeCustom' },
  ];

  readonly gradeChips: { id: GradeFilter; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'history.filterAll' },
    { id: 'gasoline92', labelKey: 'fillUp.grade.gasoline92' },
    { id: 'gasoline95', labelKey: 'fillUp.grade.gasoline95' },
    { id: 'diesel', labelKey: 'fillUp.grade.diesel' },
    { id: 'solar', labelKey: 'fillUp.grade.solar' },
    { id: 'custom', labelKey: 'fillUp.grade.custom' },
  ];

  readonly rangeOptions = computed(() =>
    this.rangePresets.map((p) => ({
      value: p.id,
      label: this.i18n.t(p.labelKey),
    })),
  );

  readonly gradeOptions = computed(() =>
    this.gradeChips.map((c) => ({
      value: c.id,
      label: this.i18n.t(c.labelKey),
    })),
  );

  readonly activeRange = computed(() => {
    const preset = this.rangePreset();
    if (preset === 'custom') {
      return {
        from: this.fromDate() || undefined,
        to: this.toDate() || undefined,
      };
    }
    return rangeBoundsForPreset(preset, todayDateOnly());
  });

  readonly rows = computed(() =>
    filterFillUps(this.db.fillUps(), {
      grade: this.gradeFilter(),
      ...this.activeRange(),
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
    return [...groups.entries()].map(([month, items]) => ({
      month,
      items,
      total: items.reduce((sum, f) => sum + f.cost, 0),
      liters: items.reduce((sum, f) => sum + f.liters, 0),
    }));
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

  setRangePreset(id: string): void {
    this.rangePreset.set(id as HistoryRangePreset);
  }

  setGrade(id: string): void {
    this.gradeFilter.set(id as GradeFilter);
  }

  editRow(id: string): void {
    this.swipeId.set(null);
    void this.router.navigate(['/fill-up'], { queryParams: { id } });
  }

  askDelete(id: string): void {
    this.swipeId.set(null);
    this.pendingDelete.set(id);
  }

  async doDelete(): Promise<void> {
    const id = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!id) {
      return;
    }
    await this.db.deleteFillUp(id);
  }

  onPointerDown(id: string, event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      return;
    }
    this.swipeActiveId = id;
    this.swipeStartX = event.clientX;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerUp(id: string, event: PointerEvent): void {
    if (this.swipeActiveId !== id) {
      return;
    }
    const dx = event.clientX - this.swipeStartX;
    const rtl = this.i18n.dir() === 'rtl';
    const open = rtl ? dx > 48 : dx < -48;
    const close = rtl ? dx < -48 : dx > 48;
    if (open) {
      this.swipeId.set(id);
    } else if (close) {
      this.swipeId.set(null);
    }
    this.swipeActiveId = null;
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
