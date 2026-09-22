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
  fillUpsToPdf,
  rangeBoundsForPreset,
  downloadFile,
  type HistoryRangePreset,
} from '../../domain/export-history';
import { efficiencyBelowBaseline } from '../../domain/economy';
import { kWhPer100Km } from '../../domain/charge-economy';
import {
  mergeEnergyHistory,
  type EnergyHistoryRow,
  type EnergyKind,
} from '../../domain/energy-history';
import { previousFillForCar } from '../../domain/fill-up-distance';
import { todayDateOnly } from '../../domain/dues';
import type { ChargeSession, FillUp, FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';
import { SelectField } from '../../ui/select-field';

type GradeFilter = FuelGrade | 'all';
type TypeFilter = EnergyKind | 'all';

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
  readonly router = inject(Router);

  readonly sectionTabs: SectionTab[] = [
    { labelKey: 'fillUp.title', link: '/fill-up' },
    { labelKey: 'section.history', link: '/history/fill-ups' },
  ];

  readonly gradeFilter = signal<GradeFilter>('all');
  readonly typeFilter = signal<TypeFilter>('all');
  readonly rangePreset = signal<HistoryRangePreset>('3months');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly shareBusy = signal(false);
  readonly shareError = signal('');
  readonly pendingDelete = signal<{ kind: EnergyKind; id: string } | null>(null);

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
    { id: 'solar', labelKey: 'fillUp.grade.solar' },
    { id: 'custom', labelKey: 'fillUp.grade.custom' },
  ];

  readonly typeChips: { id: TypeFilter; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'history.filterAllTypes' },
    { id: 'fuel', labelKey: 'history.type.fuel' },
    { id: 'charge', labelKey: 'history.type.charge' },
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

  readonly typeOptions = computed(() =>
    this.typeChips.map((c) => ({
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

  readonly fuelRows = computed(() =>
    filterFillUps(this.db.fillUps(), {
      grade: this.gradeFilter(),
      ...this.activeRange(),
    }),
  );

  readonly chargeRows = computed(() => {
    const { from, to } = this.activeRange();
    return this.db.chargeSessions().filter((c) => {
      if (from && c.date < from) {
        return false;
      }
      if (to && c.date > to) {
        return false;
      }
      return true;
    });
  });

  readonly rows = computed(() =>
    mergeEnergyHistory(this.fuelRows(), this.chargeRows(), this.typeFilter()),
  );

  readonly groupedRows = computed(() => {
    const groups = new Map<string, EnergyHistoryRow[]>();
    for (const item of this.rows()) {
      const month = item.row.date.slice(0, 7);
      const bucket = groups.get(month) ?? [];
      bucket.push(item);
      groups.set(month, bucket);
    }
    return [...groups.entries()].map(([month, items]) => {
      let km = 0;
      let hasKm = false;
      let liters = 0;
      let kWh = 0;
      for (const item of items) {
        if (item.kind === 'fuel') {
          liters += item.row.liters;
          const d = this.kmDriven(item.row);
          if (d != null) {
            km += d;
            hasKm = true;
          }
        } else {
          kWh += item.row.kWh;
          if (item.row.distanceKm != null && item.row.distanceKm > 0) {
            km += item.row.distanceKm;
            hasKm = true;
          }
        }
      }
      return {
        month,
        items,
        total: items.reduce((sum, i) => sum + i.row.cost, 0),
        liters,
        kWh,
        km: hasKm ? km : null,
      };
    });
  });

  readonly efficiencyWarn = computed(() => {
    const carId = this.db.car()?.id;
    const fills = carId
      ? this.db.fillUps().filter((f) => f.carId === carId || !f.carId)
      : this.db.fillUps();
    return efficiencyBelowBaseline(fills);
  });

  efficiencyHint(): string {
    const w = this.efficiencyWarn();
    if (!w) {
      return '';
    }
    return this.i18n.t('history.efficiencyWarnHint', {
      pct: this.i18n.formatNumber(w.pctWorse, { maximumFractionDigits: 0 }),
      baseline: this.i18n.formatUnit(w.baselineL100, 'common.lPer100', 1),
    });
  }

  isEfficiencyEnd(id: string): boolean {
    return this.efficiencyWarn()?.endId === id;
  }

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

  chargeEcoLabel(c: ChargeSession): string | null {
    const eco = kWhPer100Km(c);
    if (eco == null) {
      return null;
    }
    return this.i18n.t('charge.economyLive', {
      value: this.i18n.formatNumber(eco, { maximumFractionDigits: 1 }),
    });
  }

  formatMoney(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }

  setRangePreset(id: string): void {
    this.rangePreset.set(id as HistoryRangePreset);
  }

  setGrade(id: string): void {
    this.gradeFilter.set(id as GradeFilter);
  }

  setType(id: string): void {
    this.typeFilter.set(id as TypeFilter);
  }

  editRow(item: EnergyHistoryRow): void {
    if (item.kind === 'fuel') {
      void this.router.navigate(['/fill-up'], { queryParams: { id: item.row.id } });
    } else {
      void this.router.navigate(['/fill-up'], {
        queryParams: { chargeId: item.row.id },
      });
    }
  }

  askDelete(item: EnergyHistoryRow): void {
    this.pendingDelete.set({ kind: item.kind, id: item.row.id });
  }

  async doDelete(): Promise<void> {
    const pending = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!pending) {
      return;
    }
    if (pending.kind === 'fuel') {
      await this.db.deleteFillUp(pending.id);
    } else {
      await this.db.deleteChargeSession(pending.id);
    }
  }

  async shareCsv(): Promise<void> {
    this.shareError.set('');
    const rows = this.fuelRows();
    if (!rows.length) {
      return;
    }
    this.shareBusy.set(true);
    try {
      const csv = fillUpsToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const file = new File(
        [blob],
        `drivelog-fill-ups-${new Date().toISOString().slice(0, 10)}.csv`,
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
    const rows = this.fuelRows();
    if (!rows.length) {
      return;
    }
    this.shareBusy.set(true);
    try {
      const range = this.activeRange();
      const rangeLabel =
        range.from || range.to
          ? `${range.from ?? '…'} → ${range.to ?? '…'}`
          : undefined;
      let totalKm: number | null = null;
      let hasKm = false;
      let kmSum = 0;
      for (const f of rows) {
        const d = this.kmDriven(f);
        if (d != null) {
          kmSum += d;
          hasKm = true;
        }
      }
      if (hasKm) {
        totalKm = kmSum;
      }
      const blob = await fillUpsToPdf(
        rows,
        {
          title: this.i18n.t('history.pdfTitleFill'),
          generated: this.i18n.t('history.pdfGenerated', {
            date: new Date().toISOString().slice(0, 10),
          }),
          summary: this.i18n.t('history.pdfSummary'),
          entries: this.i18n.t('history.pdfEntries'),
          totalCost: this.i18n.t('history.pdfTotalCost'),
          totalLiters: this.i18n.t('history.pdfTotalLiters'),
          totalKm: this.i18n.t('history.pdfTotalKm'),
          rangeLabel: rangeLabel
            ? `${this.i18n.t('history.pdfRange')}: ${rangeLabel}`
            : undefined,
          columnHeaders: [
            this.i18n.t('history.pdf.col.date'),
            this.i18n.t('history.pdf.col.odometer'),
            this.i18n.t('history.pdf.col.liters'),
            this.i18n.t('history.pdf.col.cost'),
            this.i18n.t('history.pdf.col.unitPrice'),
            this.i18n.t('history.pdf.col.fuelGrade'),
            this.i18n.t('history.pdf.col.place'),
            this.i18n.t('history.pdf.col.note'),
          ],
        },
        { rtl: this.i18n.dir() === 'rtl', totalKm },
      );
      const file = new File(
        [blob],
        `drivelog-fill-ups-${new Date().toISOString().slice(0, 10)}.pdf`,
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
