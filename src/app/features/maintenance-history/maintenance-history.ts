import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  filterMaintenance,
  maintenanceToCsv,
  maintenanceToPdf,
  rangeBoundsForPreset,
  downloadFile,
  type HistoryRangePreset,
} from '../../domain/export-history';
import { todayDateOnly } from '../../domain/dues';
import { maintenanceRecordLabel } from '../../domain/part-name';
import { MAINTENANCE_TYPES } from '../../domain/models';
import type { Maintenance } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';
import { SelectField } from '../../ui/select-field';

@Component({
  selector: 'app-maintenance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, SectionTabs, RouterLink, DateField, SelectField, ConfirmBar],
  templateUrl: './maintenance-history.html',
  styleUrl: './maintenance-history.scss',
})
export class MaintenanceHistoryPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly sectionTabs: SectionTab[] = [
    { labelKey: 'maint.title', link: '/maintenance' },
    { labelKey: 'section.history', link: '/history/maintenance' },
  ];

  readonly typeFilter = signal<string>('all');
  readonly rangePreset = signal<HistoryRangePreset>('3months');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly shareBusy = signal(false);
  readonly shareError = signal('');
  readonly pendingDelete = signal<string | null>(null);

  readonly rangePresets: { id: HistoryRangePreset; labelKey: MsgKey }[] = [
    { id: 'thisMonth', labelKey: 'history.rangeThisMonth' },
    { id: '3months', labelKey: 'history.range3Months' },
    { id: 'year', labelKey: 'history.rangeYear' },
    { id: 'custom', labelKey: 'history.rangeCustom' },
  ];

  readonly rangeOptions = computed(() =>
    this.rangePresets.map((p) => ({
      value: p.id,
      label: this.i18n.t(p.labelKey),
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

  readonly rangedRows = computed(() =>
    filterMaintenance(this.db.maintenance(), {
      type: 'all',
      ...this.activeRange(),
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  );

  readonly presentTypes = computed(() => {
    const seen = new Set<string>();
    for (const row of this.rangedRows()) {
      seen.add(this.typeId(row));
    }
    const standard = MAINTENANCE_TYPES.filter((id) => seen.has(id));
    const custom = [...seen].filter((id) => id.startsWith('custom:')).sort();
    return [...standard, ...custom];
  });

  readonly showTypeFilter = computed(() => this.presentTypes().length > 1);

  readonly activeType = computed(() => {
    const selected = this.typeFilter();
    if (!this.showTypeFilter() || selected === 'all') {
      return 'all';
    }
    return this.presentTypes().includes(selected) ? selected : 'all';
  });

  readonly typeOptions = computed(() => [
    { value: 'all', label: this.i18n.t('maint.filterAll') },
    ...this.presentTypes().map((id) => ({
      value: id,
      label: id.startsWith('custom:')
        ? id.slice('custom:'.length)
        : this.i18n.t(`maintenance.type.${id}` as MsgKey),
    })),
  ]);

  readonly rows = computed(() =>
    filterMaintenance(this.rangedRows(), { type: this.activeType() }),
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
      total: items.reduce((sum, m) => sum + (m.cost != null ? m.cost : 0), 0),
    }));
  });

  readonly periodTotals = computed(() => {
    let total = 0;
    let count = 0;
    for (const group of this.groupedRows()) {
      total += group.total;
      count += group.items.length;
    }
    return { total, count };
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

  dayNumber(date: string): string {
    return this.i18n.formatDate(date, { day: 'numeric' });
  }

  monthShort(date: string): string {
    return this.i18n.formatDate(date, { month: 'short' });
  }

  typeId(row: Maintenance): string {
    return row.otherLabel ? `custom:${row.otherLabel}` : row.type;
  }

  rowLabel(m: Maintenance): string {
    return maintenanceRecordLabel(m, this.db.catalog(), (key) => this.i18n.t(key as MsgKey));
  }

  formatMoney(value: number | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.i18n.t('budget.notEnoughData');
    }
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }

  setType(id: string): void {
    this.typeFilter.set(id);
  }

  setRangePreset(id: string): void {
    this.rangePreset.set(id as HistoryRangePreset);
  }

  editRow(id: string): void {
    void this.router.navigate(['/maintenance'], { queryParams: { id } });
  }

  askDelete(id: string): void {
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
      downloadFile(file);
    } catch {
      this.shareError.set(this.i18n.t('history.shareFailed'));
    } finally {
      this.shareBusy.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    this.shareError.set('');
    const rows = this.rows();
    if (!rows.length) {
      return;
    }
    this.shareBusy.set(true);
    try {
      const range = this.activeRange();
      const rangeLabel =
        range.from || range.to ? `${range.from ?? '…'} - ${range.to ?? '…'}` : undefined;
      const blob = await maintenanceToPdf(
        rows,
        {
          title: this.i18n.t('history.pdfTitleMaint'),
          generated: this.i18n.t('history.pdfGenerated', {
            date: new Date().toISOString().slice(0, 10),
          }),
          summary: this.i18n.t('history.pdfSummary'),
          entries: this.i18n.t('history.pdfEntries'),
          totalCost: this.i18n.t('history.pdf.costAllMonths'),
          avgCost: this.i18n.t('history.pdf.avgCost'),
          monthItems: this.i18n.t('history.pdf.itemTotal'),
          monthCost: this.i18n.t('history.pdfTotalCost'),
          itemHeader: this.i18n.t('history.pdf.col.item'),
          rangeLabel: rangeLabel ? `${this.i18n.t('history.pdfRange')}: ${rangeLabel}` : undefined,
          columnHeaders: [
            this.i18n.t('history.pdf.col.date'),
            this.i18n.t('history.pdf.col.type'),
            this.i18n.t('history.pdf.col.otherLabel'),
            this.i18n.t('history.pdf.col.odometer'),
            this.i18n.t('history.pdf.col.cost'),
            this.i18n.t('history.pdf.col.dueKm'),
            this.i18n.t('history.pdf.col.dueDate'),
            this.i18n.t('history.pdf.col.note'),
            this.i18n.t('history.pdf.col.center'),
            this.i18n.t('history.pdf.col.technician'),
            this.i18n.t('history.pdf.col.partBrand'),
            this.i18n.t('history.pdf.col.partCost'),
            this.i18n.t('history.pdf.col.laborCost'),
          ],
        },
        {
          rtl: this.i18n.dir() === 'rtl',
          labelFor: (row) =>
            maintenanceRecordLabel(row, this.db.catalog(), (key) => this.i18n.t(key as MsgKey)),
        },
      );
      const file = new File(
        [blob],
        `drivelog-maintenance-${new Date().toISOString().slice(0, 10)}.pdf`,
        { type: 'application/pdf' },
      );
      downloadFile(file);
    } catch {
      this.shareError.set(this.i18n.t('history.shareFailed'));
    } finally {
      this.shareBusy.set(false);
    }
  }
}
