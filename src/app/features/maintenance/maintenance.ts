import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { publicHolidays } from '../../data/remote';
import { countryFromCurrency } from '../../domain/country';
import { buildDueItems, todayDateOnly } from '../../domain/dues';
import { firstDueHolidayNudge, type PublicHoliday } from '../../domain/holidays';
import { legacyTypeForPart } from '../../domain/health-migration';
import { sampleDiscoveryHoliday } from '../../domain/sample-data';
import { odometerInputValue, roundOdometerKm } from '../../domain/odometer';
import type {
  DueItem,
  DueStatus,
  Maintenance,
  MaintenanceRecordType,
  PartCondition,
  PartDefinition,
} from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { DueRow } from '../../ui/due-row';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

const RECORD_TYPES: MaintenanceRecordType[] = [
  'replacement',
  'service',
  'inspection',
  'repair',
  'measurement',
];

@Component({
  selector: 'app-maintenance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    SectionTabs,
    TextField,
    NumericField,
    DateField,
    SelectField,
    PrimaryButton,
    ConfirmBar,
    DueRow,
    RouterLink,
  ],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.scss',
})
export class MaintenancePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly route = inject(ActivatedRoute);

  readonly sectionTabs: SectionTab[] = [
    { labelKey: 'maint.title', link: '/maintenance' },
    { labelKey: 'section.history', link: '/history/maintenance' },
  ];

  /** 1 = part+type, 2 = odo+date (+save), 3 = optional extras */
  readonly step = signal(1);
  readonly partId = signal('');
  readonly recordType = signal('service');
  readonly cost = signal('');
  readonly odometer = signal(odometerInputValue(this.db.car()?.currentOdometer));
  readonly date = signal(todayDateOnly());
  readonly note = signal('');
  readonly dueKm = signal('');
  readonly dueDate = signal('');
  readonly partModel = signal('');
  readonly condition = signal('');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly odoError = signal('');
  readonly costError = signal('');
  readonly holidays = signal<PublicHoliday[]>([]);
  readonly saveAnyway = signal(false);

  readonly partOptions = computed(() => {
    const opts = this.db.catalog().map((p) => ({
      value: p.id,
      label: this.partLabel(p),
    }));
    return opts;
  });

  readonly recordTypeOptions = computed(() =>
    RECORD_TYPES.map((value) => ({
      value,
      label: this.i18n.t(`maint.record.${value}` as MsgKey),
    })),
  );

  readonly conditionOptions = computed(() =>
    (['good', 'fair', 'poor', 'critical'] as const).map((value) => ({
      value,
      label: value,
    })),
  );

  readonly canSave = computed(() => {
    return !!this.partId() && !!this.recordType() && this.step() >= 2;
  });

  readonly history = computed(() =>
    [...this.db.maintenance()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  readonly recentHistory = computed(() => this.history().slice(0, 3));
  readonly hasMoreHistory = computed(() => this.history().length > 3);

  readonly dues = computed((): DueItem[] => {
    const car = this.db.car();
    if (!car) return [];
    return buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
      todayDateOnly(),
      car,
    ).filter((d) => d.status === 'overdue' || d.status === 'dueSoon');
  });

  readonly duesSummary = computed(() => {
    const items = this.dues();
    return {
      overdue: items.filter((d) => d.status === 'overdue').length,
      soon: items.filter((d) => d.status === 'dueSoon').length,
      total: items.length,
    };
  });

  readonly holidayNudge = computed(() => {
    const car = this.db.car();
    if (!car) return null;
    const today = todayDateOnly();
    const items = buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
      today,
      car,
    );
    return firstDueHolidayNudge(
      items.map((d) => d.dueDate),
      this.holidays(),
      today,
    );
  });

  constructor() {
    const id = this.route.snapshot.queryParamMap.get('id');
    const partQ = this.route.snapshot.queryParamMap.get('partId');
    if (partQ) {
      this.partId.set(partQ);
      this.step.set(2);
    }
    if (id) {
      const row = this.db.maintenance().find((m) => m.id === id);
      if (row) this.startEdit(row);
    }
    void this.loadHolidays();
  }

  private async loadHolidays(): Promise<void> {
    const today = todayDateOnly();
    const demo = this.db.settings().sampleMode
      ? sampleDiscoveryHoliday(today, this.i18n.t('home.sample.holiday'))
      : null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.holidays.set(demo ? [demo] : []);
      return;
    }
    const cc = countryFromCurrency(this.db.settings().currency);
    const year = Number(today.slice(0, 4));
    const list = await publicHolidays(cc, year);
    this.holidays.set(demo ? [demo, ...list] : list);
  }

  partLabel(p: PartDefinition): string {
    if (p.labelKey) return this.i18n.t(p.labelKey as MsgKey);
    if (p.name?.startsWith('maintenance.') || p.name?.startsWith('parts.')) {
      return this.i18n.t(p.name as MsgKey);
    }
    return p.name ?? p.id;
  }

  dueLabel(d: DueItem): string {
    return this.i18n.t(d.labelKey as MsgKey);
  }

  dueStatus(m: Maintenance): DueStatus | null {
    const car = this.db.car();
    if (!car) return null;
    const items = buildDueItems(
      this.db.settings(),
      [m],
      car.currentOdometer,
      todayDateOnly(),
      car,
    );
    return items.find((i) => i.maintenanceId === m.id)?.status ?? null;
  }

  nextStep(): void {
    if (this.step() === 1 && this.partId() && this.recordType()) {
      this.step.set(2);
      return;
    }
    if (this.step() === 2) this.step.set(3);
  }

  prevStep(): void {
    this.step.update((s) => Math.max(1, s - 1));
  }

  resetForm(): void {
    this.editId.set(null);
    this.step.set(1);
    this.partId.set('');
    this.recordType.set('service');
    this.cost.set('');
    this.odometer.set(odometerInputValue(this.db.car()?.currentOdometer));
    this.date.set(todayDateOnly());
    this.note.set('');
    this.dueKm.set('');
    this.dueDate.set('');
    this.partModel.set('');
    this.condition.set('');
    this.odoError.set('');
    this.costError.set('');
    this.saveAnyway.set(false);
  }

  startEdit(row: Maintenance): void {
    this.editId.set(row.id);
    this.step.set(2);
    this.partId.set(row.partDefinitionId ?? '');
    this.recordType.set(row.recordType ?? 'service');
    this.cost.set(row.cost != null ? String(row.cost) : '');
    this.odometer.set(odometerInputValue(row.odometer));
    this.date.set(row.date);
    this.note.set(row.note ?? '');
    this.dueKm.set(row.dueKm != null ? String(row.dueKm) : '');
    this.dueDate.set(row.dueDate ?? '');
    this.partModel.set(row.partModel ?? '');
    this.condition.set(row.condition ?? '');
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const odometer = roundOdometerKm(Number(this.odometer()));
    this.odoError.set('');
    this.costError.set('');
    if (!Number.isFinite(odometer) || odometer < 0) {
      this.odoError.set(this.i18n.t('maint.err.odometer'));
      return;
    }
    const costRaw = this.cost().trim();
    let cost: number | undefined;
    if (costRaw !== '') {
      cost = Number(costRaw);
      if (!Number.isFinite(cost) || cost < 0) {
        this.costError.set(this.i18n.t('maint.err.cost'));
        return;
      }
    }
    const part = this.db.catalog().find((p) => p.id === this.partId());
    if (!part) return;
    const legacy = legacyTypeForPart(part);
    const dueKmRaw = this.dueKm().trim();
    const dueKm = dueKmRaw ? Number(dueKmRaw) : undefined;
    const dueDate = this.dueDate().trim() || undefined;
    const dueKmVal = Number.isFinite(dueKm) ? dueKm : undefined;
    const cond = this.condition();

    this.saving.set(true);
    try {
      await this.db.saveMaintenance({
        id: this.editId() ?? undefined,
        type: legacy.type,
        otherLabel: legacy.otherLabel,
        partDefinitionId: part.id,
        recordType: this.recordType() as MaintenanceRecordType,
        cost,
        odometer,
        date: this.date(),
        note: this.note().trim() || undefined,
        dueKm: dueKmVal,
        dueDate,
        partModel: this.partModel().trim() || undefined,
        condition: (cond as PartCondition) || undefined,
      });
      if (
        (dueKmVal != null || !!dueDate) &&
        !this.db.settings().firstDueAt &&
        this.db.settings().sampleMode !== true
      ) {
        await this.db.updateSettings({ firstDueAt: new Date().toISOString() });
      }
      this.resetForm();
    } finally {
      this.saving.set(false);
    }
  }

  rowLabel(m: Maintenance): string {
    if (m.partDefinitionId) {
      const p = this.db.catalog().find((x) => x.id === m.partDefinitionId);
      if (p) return this.partLabel(p);
    }
    if (m.otherLabel) return m.otherLabel;
    return this.i18n.t(`maintenance.type.${m.type}` as MsgKey);
  }

  askDelete(id: string): void {
    this.pendingDelete.set(id);
  }

  async doDelete(): Promise<void> {
    const id = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!id) return;
    await this.db.deleteMaintenance(id);
    if (this.editId() === id) this.resetForm();
  }

  formatMoney(value: number | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.i18n.t('budget.notEnoughData');
    }
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }
}
