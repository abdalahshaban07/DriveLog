import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  filterMaintenance,
  maintenanceToCsv,
  rangeBoundsForPreset,
  type HistoryRangePreset,
} from '../../domain/export-csv';
import { todayDateOnly } from '../../domain/dues';
import { MAINTENANCE_TYPES } from '../../domain/models';
import type { Maintenance } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';

@Component({
  selector: 'app-maintenance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, DateField],
  templateUrl: './maintenance-history.html',
})
export class MaintenanceHistoryPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly typeFilter = signal<string>('all');
  readonly rangePreset = signal<HistoryRangePreset>('3months');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly shareBusy = signal(false);
  readonly shareError = signal('');

  readonly rangePresets: { id: HistoryRangePreset; labelKey: MsgKey }[] = [
    { id: 'thisMonth', labelKey: 'history.rangeThisMonth' },
    { id: '3months', labelKey: 'history.range3Months' },
    { id: 'year', labelKey: 'history.rangeYear' },
    { id: 'custom', labelKey: 'history.rangeCustom' },
  ];

  readonly typeChips = computed(() => {
    const chips: { id: string; labelKey?: MsgKey; label?: string }[] = [
      { id: 'all', labelKey: 'history.filterAll' },
    ];
    for (const value of MAINTENANCE_TYPES) {
      chips.push({ id: value, labelKey: `maintenance.type.${value}` as MsgKey });
    }
    for (const name of this.db.settings().customMaintenanceTypes ?? []) {
      chips.push({ id: `custom:${name}`, label: name });
    }
    return chips;
  });

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
    filterMaintenance(this.db.maintenance(), {
      type: this.typeFilter(),
      ...this.activeRange(),
    }).sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  readonly groupedRows = computed(() => {
    const groups = new Map<string, Maintenance[]>();
    for (const row of this.rows()) {
      const month = row.date.slice(0, 7);
      const bucket = groups.get(month) ?? [];
      bucket.push(row);
      groups.set(month, bucket);
    }
    return [...groups.entries()].map(([month, items]) => ({
      month,
      items,
      total: items.reduce((sum, m) => sum + m.cost, 0),
    }));
  });

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

  rowLabel(m: Maintenance): string {
    if (m.otherLabel) {
      return m.otherLabel;
    }
    return this.i18n.t(`maintenance.type.${m.type}` as MsgKey);
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

  chipLabel(chip: { id: string; labelKey?: MsgKey; label?: string }): string {
    if (chip.labelKey) {
      return this.i18n.t(chip.labelKey);
    }
    return chip.label ?? chip.id;
  }

  setType(id: string): void {
    this.typeFilter.set(id);
  }

  setRangePreset(id: HistoryRangePreset): void {
    this.rangePreset.set(id);
  }

  async shareCsv(): Promise<void> {
    this.shareError.set('');
    const rows = this.rows();
    if (!rows.length) {
      return;
    }
    this.shareBusy.set(true);
    try {
      const csv = maintenanceToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const file = new File(
        [blob],
        `drivelog-maintenance-${new Date().toISOString().slice(0, 10)}.csv`,
        { type: 'text/csv' },
      );
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: this.i18n.t('history.maintShareTitle'),
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
