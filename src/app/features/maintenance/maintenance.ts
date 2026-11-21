import { FormDrafts, bindFormDraft } from '../../data/form-draft';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injector,
  runInInjectionContext,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { publicHolidays } from '../../data/remote';
import { countryFromCurrency } from '../../domain/country';
import { buildDueItems, todayDateOnly } from '../../domain/dues';
import { firstDueHolidayNudge, type PublicHoliday } from '../../domain/holidays';
import { SYSTEM_ENGINE_OIL_ID } from '../../domain/part-catalog';
import { legacyTypeForPart } from '../../domain/health-migration';
import { dueItemLabel, maintenanceRecordLabel, partDefinitionLabel } from '../../domain/part-name';
import { sampleDiscoveryHoliday } from '../../domain/sample-data';
import { odometerInputValue, roundOdometerKm } from '../../domain/odometer';
import {
  PART_CONDITIONS,
  type DueItem,
  type DueStatus,
  type Maintenance,
  type MaintenanceRecordType,
  type PartCondition,
  type PartDefinition,
} from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';
import { PrimaryButton } from '../../ui/primary-button';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-maintenance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    PageLine,
    SectionTabs,
    TextField,
    NumericField,
    DateField,
    SelectField,
    PrimaryButton,
    ConfirmBar,
    RouterLink,
  ],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.scss',
})
export class MaintenancePage {
  readonly drafts = inject(FormDrafts);
  draft: ReturnType<typeof bindFormDraft> | null = null;
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly serviceForm = viewChild<ElementRef<HTMLElement>>('serviceForm');

  readonly sectionTabs: SectionTab[] = [
    { labelKey: 'maint.title', link: '/maintenance' },
    { labelKey: 'section.history', link: '/history/maintenance' },
  ];

  readonly pendingRestore = signal<string | null>(null);
  readonly restoreError = signal(false);
  readonly revisions = computed(() =>
    this.db
      .maintenanceRevisions()
      .filter(
        (r) => r.maintenanceId === this.editId() && (!r.carId || r.carId === this.db.car()?.id),
      )
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
  );

  revisionTime(value: string): string {
    return this.i18n.formatDate(new Date(value), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  async restoreRevision(): Promise<void> {
    const id = this.pendingRestore();
    this.pendingRestore.set(null);
    if (!id) return;
    this.restoreError.set(false);
    try {
      await this.db.restoreMaintenanceRevision(id);
      const row = this.db.maintenance().find((m) => m.id === this.editId());
      this.draft?.clear();
      if (row) this.startEdit(row);
    } catch {
      this.restoreError.set(true);
    }
  }

  readonly partId = signal('');
  /** Persisted for budget/routine; no UI — default service, preserve on edit. */
  readonly recordType = signal<MaintenanceRecordType>('service');
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

  readonly partOptions = computed(() => {
    const opts = this.db.catalog().map((p) => ({
      value: p.id,
      label: this.partLabel(p),
    }));
    return opts;
  });

  readonly conditionOptions = computed(() =>
    PART_CONDITIONS.map((value) => ({
      value,
      label: this.i18n.t(`maint.condition.${value}` as MsgKey),
    })),
  );

  readonly newServiceLabel = computed(() =>
    this.i18n.t(this.partId() === SYSTEM_ENGINE_OIL_ID ? 'maint.newOilChange' : 'maint.newService'),
  );

  readonly canSave = computed(() => !!this.partId());

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
    const rank: Record<DueStatus, number> = { overdue: 0, dueSoon: 1, future: 2 };
    return buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
      todayDateOnly(),
      car,
    )
      .filter((d) => d.status === 'overdue' || d.status === 'dueSoon')
      .sort((a, b) => rank[a.status] - rank[b.status]);
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
    const serviceFor = this.route.snapshot.queryParamMap.get('serviceFor');
    if (serviceFor && !id) {
      const previous = this.db.maintenance().find((m) => m.id === serviceFor);
      if (previous) {
        const part =
          previous.partDefinitionId ??
          this.db.catalog().find((p) => {
            const legacy = legacyTypeForPart(p);
            return legacy.type === previous.type && legacy.otherLabel === previous.otherLabel;
          })?.id;
        if (part) this.partId.set(part);
      }
    }
    if (partQ) this.partId.set(partQ);
    if (id) {
      const row = this.db.maintenance().find((m) => m.id === id);
      if (row) this.startEdit(row);
    }
    this.bindDraft();
    void this.loadHolidays();
  }

  private bindDraft(): void {
    this.draft?.stop();
    this.draft = runInInjectionContext(this.injector, () =>
      bindFormDraft(
        this.drafts,
        `maintenance:${this.db.car()?.id ?? ''}:${this.editId() ? this.editId() + ':' + this.db.maintenance().find((m) => m.id === this.editId())?.updatedAt : 'new'}`,
        {
          partId: this.partId,
          cost: this.cost,
          odometer: this.odometer,
          date: this.date,
          note: this.note,
          dueKm: this.dueKm,
          dueDate: this.dueDate,
          partModel: this.partModel,
          condition: this.condition,
        },
      ),
    );
  }

  discardDraft(): void {
    this.draft?.clear();
    const row = this.db.maintenance().find((m) => m.id === this.editId());
    this.resetForm();
    if (row) this.startEdit(row);
    else this.bindDraft();
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
    return partDefinitionLabel(p, (key) => this.i18n.t(key as MsgKey));
  }

  dueLabel(d: DueItem): string {
    return dueItemLabel(d, this.db.maintenance(), this.db.catalog(), (key) =>
      this.i18n.t(key as MsgKey),
    );
  }

  dueStateLabel(status: DueStatus): string {
    switch (status) {
      case 'overdue':
        return this.i18n.t('due.overdue');
      case 'dueSoon':
        return this.i18n.t('due.dueSoon');
      case 'future':
        return '';
      default: {
        const neverStatus: never = status;
        return neverStatus;
      }
    }
  }

  dueMeta(d: DueItem): string {
    if (d.dueKm != null) {
      return `${this.i18n.formatNumber(d.dueKm, { maximumFractionDigits: 0 })} ${this.i18n.t('common.km')}`;
    }
    if (d.dueDate) {
      return this.i18n.formatDate(d.dueDate, { day: 'numeric', month: 'short' });
    }
    return '';
  }

  dayNumber(date: string): string {
    return this.i18n.formatDate(date, { day: 'numeric' });
  }

  monthShort(date: string): string {
    return this.i18n.formatDate(date, { month: 'short' });
  }

  resetForm(): void {
    this.editId.set(null);
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
  }

  /** A real new service keeps only the part, never the old cost or service details. */
  startNewService(partId = ''): void {
    this.draft?.stop();
    this.resetForm();
    this.partId.set(partId);
    this.bindDraft();
    this.serviceForm()?.nativeElement.focus();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: partId ? { partId } : {},
      replaceUrl: true,
    });
  }

  newServiceFor(row: Maintenance): string {
    return this.i18n.t(
      row.partDefinitionId === SYSTEM_ENGINE_OIL_ID ? 'maint.newOilChange' : 'maint.newService',
    );
  }

  startEdit(row: Maintenance): void {
    this.draft?.stop();
    this.editId.set(row.id);
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
    if (this.draft) this.bindDraft();
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
        recordType: this.recordType(),
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
      this.draft?.clear();
      this.startNewService();
    } finally {
      this.saving.set(false);
    }
  }

  rowLabel(m: Maintenance): string {
    return maintenanceRecordLabel(m, this.db.catalog(), (key) => this.i18n.t(key as MsgKey));
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
