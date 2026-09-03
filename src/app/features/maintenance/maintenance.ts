import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { buildDueItems, todayDateOnly } from '../../domain/dues';
import { MAINTENANCE_TYPES } from '../../domain/models';
import type { DueStatus } from '../../domain/models';
import type { Maintenance, MaintenanceType } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

const ADD_TYPE = '__add__';

@Component({
  selector: 'app-maintenance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
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
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly route = inject(ActivatedRoute);

  readonly type = signal('oil');
  readonly cost = signal('');
  readonly odometer = signal(String(this.db.car()?.currentOdometer ?? ''));
  readonly date = signal(todayDateOnly());
  readonly note = signal('');
  readonly dueKm = signal('');
  readonly dueDate = signal('');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly odoError = signal('');
  readonly costError = signal('');
  readonly newTypeName = signal('');
  readonly newTypeError = signal('');

  readonly addingType = computed(() => this.type() === ADD_TYPE);

  readonly typeOptions = computed(() => {
    const opts: { value: string; label: string }[] = MAINTENANCE_TYPES.map((value) => ({
      value,
      label: this.i18n.t(`maintenance.type.${value}` as MsgKey),
    }));
    for (const name of this.db.settings().customMaintenanceTypes ?? []) {
      opts.push({ value: `custom:${name}`, label: name });
    }
    opts.push({ value: ADD_TYPE, label: this.i18n.t('maint.addType') });
    return opts;
  });

  readonly history = computed(() =>
    [...this.db.maintenance()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  readonly recentHistory = computed(() => this.history().slice(0, 3));

  readonly hasMoreHistory = computed(() => this.history().length > 3);

  constructor() {
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      const row = this.db.maintenance().find((m) => m.id === id);
      if (row) {
        this.startEdit(row);
      }
    }
  }

  dueStatus(m: Maintenance): DueStatus | null {
    const car = this.db.car();
    if (!car) {
      return null;
    }
    const today = todayDateOnly();
    const items = buildDueItems(
      this.db.settings(),
      [m],
      car.currentOdometer,
      today,
      car,
    );
    const match = items.find((i) => i.maintenanceId === m.id);
    return match?.status ?? null;
  }

  resetForm(): void {
    this.editId.set(null);
    this.type.set('oil');
    this.cost.set('');
    this.odometer.set(String(this.db.car()?.currentOdometer ?? ''));
    this.date.set(todayDateOnly());
    this.note.set('');
    this.dueKm.set('');
    this.dueDate.set('');
    this.odoError.set('');
    this.costError.set('');
    this.newTypeName.set('');
    this.newTypeError.set('');
  }

  startEdit(row: Maintenance): void {
    this.editId.set(row.id);
    this.type.set(row.otherLabel ? `custom:${row.otherLabel}` : row.type);
    this.cost.set(String(row.cost));
    this.odometer.set(String(row.odometer));
    this.date.set(row.date);
    this.note.set(row.note ?? '');
    this.dueKm.set(row.dueKm != null ? String(row.dueKm) : '');
    this.dueDate.set(row.dueDate ?? '');
  }

  parseType(value: string): { type: MaintenanceType; otherLabel?: string } {
    if (value.startsWith('custom:')) {
      return { type: 'other', otherLabel: value.slice(7) };
    }
    return { type: value as MaintenanceType };
  }

  async saveNewType(): Promise<void> {
    this.newTypeError.set('');
    const result = await this.db.addCustomType(this.newTypeName());
    if (!result.ok) {
      this.newTypeError.set(
        result.reason === 'empty'
          ? this.i18n.t('types.err.empty')
          : this.i18n.t('types.err.duplicate'),
      );
      return;
    }
    this.type.set(`custom:${result.name}`);
    this.newTypeName.set('');
  }

  async save(): Promise<void> {
    if (this.addingType()) {
      return;
    }
    const cost = Number(this.cost());
    const odometer = Number(this.odometer());
    this.odoError.set('');
    this.costError.set('');
    let ok = true;
    if (!Number.isFinite(odometer) || odometer < 0) {
      this.odoError.set(this.i18n.t('maint.err.odometer'));
      ok = false;
    }
    if (!Number.isFinite(cost)) {
      this.costError.set(this.i18n.t('maint.err.cost'));
      ok = false;
    }
    if (!ok) {
      return;
    }
    const { type, otherLabel } = this.parseType(this.type());
    const dueKmRaw = this.dueKm().trim();
    const dueKm = dueKmRaw ? Number(dueKmRaw) : undefined;
    this.saving.set(true);
    try {
      await this.db.saveMaintenance({
        id: this.editId() ?? undefined,
        type,
        otherLabel,
        cost,
        odometer,
        date: this.date(),
        note: this.note().trim() || undefined,
        dueKm: Number.isFinite(dueKm) ? dueKm : undefined,
        dueDate: this.dueDate().trim() || undefined,
      });
      this.resetForm();
    } finally {
      this.saving.set(false);
    }
  }

  rowLabel(m: Maintenance): string {
    if (m.otherLabel) {
      return m.otherLabel;
    }
    return this.i18n.t(`maintenance.type.${m.type}` as MsgKey);
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
    if (this.editId() === id) {
      this.resetForm();
    }
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
}
