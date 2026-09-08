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
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { SelectField } from '../../ui/select-field';

@Component({
  selector: 'app-maintenance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, DateField, SelectField, ConfirmBar],
  templateUrl: './maintenance-history.html',
  styleUrl: './maintenance-history.scss',
})
export class MaintenanceHistoryPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);

  readonly typeFilter = signal<string>('all');
  readonly rangePreset = signal<HistoryRangePreset>('3months');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly shareBusy = signal(false);
  readonly shareError = signal('');
  readonly openMenuId = signal<string | null>(null);
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

  readonly typeChips = computed(() => {
    const chips: { id: string; labelKey?: MsgKey; label?: string }[] = [
      { id: 'all', labelKey: 'maint.filterAll' },
    ];
    for (const value of MAINTENANCE_TYPES) {
      chips.push({ id: value, labelKey: `maintenance.type.${value}` as MsgKey });
    }
    for (const name of this.db.settings().customMaintenanceTypes ?? []) {
      chips.push({ id: `custom:${name}`, label: name });
    }
    return chips;
  });

  readonly rangeOptions = computed(() =>
    this.rangePresets.map((p) => ({
      value: p.id,
      label: this.i18n.t(p.labelKey),
    })),
  );

  readonly typeOptions = computed(() =>
    this.typeChips().map((c) => ({
      value: c.id,
      label: this.chipLabel(c),
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

  setRangePreset(id: string): void {
    this.rangePreset.set(id as HistoryRangePreset);
  }

  toggleMenu(id: string): void {
    this.openMenuId.update((cur) => (cur === id ? null : id));
  }

  editRow(id: string): void {
    this.openMenuId.set(null);
    this.swipeId.set(null);
    void this.router.navigate(['/maintenance'], { queryParams: { id } });
  }

  askDelete(id: string): void {
    this.openMenuId.set(null);
    this.swipeId.set(null);
    this.pendingDelete.set(id);
  }

  async doDelete(): Promise<void> {
    const id = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!id) {
      return;
    }
    await this.db.deleteMaintenance(id);
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
