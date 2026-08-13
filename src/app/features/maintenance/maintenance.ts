import { Component, computed, inject, signal } from '@angular/core';
import { Db } from '../../data/db';
import { buildDueItems, todayDateOnly } from '../../domain/dues';
import { costFromPartLabor, normalizeCustomTypes } from '../../domain/maintenance-fields';
import {
  MAINTENANCE_TYPES,
  type DueStatus,
  type Maintenance,
  type MaintenanceType,
} from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

const CUSTOM_PREFIX = 'custom:';

@Component({
  selector: 'app-maintenance',
  imports: [
    PageHeader,
    SelectField,
    TextField,
    NumericField,
    DateField,
    PrimaryButton,
    ConfirmBar,
  ],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.scss',
})
export class MaintenancePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly editId = signal<string | null>(null);
  readonly type = signal<MaintenanceType>('oil');
  readonly otherLabel = signal('');
  readonly cost = signal('');
  readonly odometer = signal(String(this.db.car()?.currentOdometer ?? ''));
  readonly date = signal(todayDateOnly());
  readonly dueKm = signal('');
  readonly dueDate = signal('');
  readonly note = signal('');
  readonly centerName = signal('');
  readonly technicianName = signal('');
  readonly partBrand = signal('');
  readonly partCost = signal('');
  readonly laborCost = signal('');
  readonly saving = signal(false);
  readonly pendingDelete = signal<string | null>(null);

  readonly typeSelectValue = computed(() => {
    const label = this.otherLabel();
    if (this.type() === 'other' && label) {
      return `${CUSTOM_PREFIX}${label}`;
    }
    return this.type();
  });

  readonly typeOptions = computed(() => {
    this.i18n.language();
    const builtins = MAINTENANCE_TYPES.filter((value) => value !== 'other').map((value) => ({
      value,
      label: this.typeLabel(value),
    }));
    const customs = normalizeCustomTypes([
      ...(this.db.settings().customMaintenanceTypes ?? []),
      ...(this.type() === 'other' ? [this.otherLabel()] : []),
    ]);
    return [
      ...builtins,
      ...customs.map((name) => ({
        value: `${CUSTOM_PREFIX}${name}`,
        label: name,
      })),
    ];
  });

  readonly dueById = computed(() => {
    const car = this.db.car();
    const map = new Map<string, DueStatus>();
    if (!car) {
      return map;
    }
    for (const item of buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
    )) {
      if (item.maintenanceId) {
        map.set(item.maintenanceId, item.status);
      }
    }
    return map;
  });

  onTypeValue(value: string): void {
    if (value.startsWith(CUSTOM_PREFIX)) {
      this.type.set('other');
      this.otherLabel.set(value.slice(CUSTOM_PREFIX.length));
      return;
    }
    if ((MAINTENANCE_TYPES as readonly string[]).includes(value) && value !== 'other') {
      this.type.set(value as MaintenanceType);
      this.otherLabel.set('');
    }
  }

  onPartCost(value: string): void {
    this.partCost.set(value);
    this.syncCostFromParts();
  }

  onLaborCost(value: string): void {
    this.laborCost.set(value);
    this.syncCostFromParts();
  }

  private syncCostFromParts(): void {
    const next = costFromPartLabor(this.partCost(), this.laborCost());
    if (next != null) {
      this.cost.set(next);
    }
  }

  typeLabel(t: MaintenanceType): string {
    return this.i18n.t(`maintenance.type.${t}` as MsgKey);
  }

  rowLabel(m: Maintenance): string {
    return m.otherLabel || this.typeLabel(m.type);
  }

  rowStatus(id: string): DueStatus | undefined {
    return this.dueById().get(id);
  }

  rowStatusLabel(id: string): string {
    const status = this.rowStatus(id);
    switch (status) {
      case 'overdue':
        return this.i18n.t('due.overdue');
      case 'dueSoon':
        return this.i18n.t('due.dueSoon');
      case 'future':
      case undefined:
        return '';
      default: {
        const _never: never = status;
        return _never;
      }
    }
  }

  edit(m: Maintenance): void {
    this.editId.set(m.id);
    this.type.set(m.type);
    this.otherLabel.set(m.otherLabel ?? '');
    this.cost.set(String(m.cost));
    this.odometer.set(String(m.odometer));
    this.date.set(m.date);
    this.dueKm.set(m.dueKm == null ? '' : String(m.dueKm));
    this.dueDate.set(m.dueDate ?? '');
    this.note.set(m.note ?? '');
    this.centerName.set(m.centerName ?? '');
    this.technicianName.set(m.technicianName ?? '');
    this.partBrand.set(m.partBrand ?? '');
    this.partCost.set(m.partCost == null ? '' : String(m.partCost));
    this.laborCost.set(m.laborCost == null ? '' : String(m.laborCost));
  }

  askDelete(id: string): void {
    this.pendingDelete.set(id);
  }

  async doDelete(): Promise<void> {
    const id = this.pendingDelete();
    if (!id) {
      return;
    }
    await this.db.deleteMaintenance(id);
    this.pendingDelete.set(null);
    if (this.editId() === id) {
      this.resetForm();
    }
  }

  resetForm(): void {
    this.editId.set(null);
    this.type.set('oil');
    this.otherLabel.set('');
    this.cost.set('');
    this.odometer.set(String(this.db.car()?.currentOdometer ?? ''));
    this.date.set(todayDateOnly());
    this.dueKm.set('');
    this.dueDate.set('');
    this.note.set('');
    this.centerName.set('');
    this.technicianName.set('');
    this.partBrand.set('');
    this.partCost.set('');
    this.laborCost.set('');
  }

  async save(): Promise<void> {
    const cost = Number(this.cost() || '0');
    const odometer = Number(this.odometer());
    const dueKmRaw = this.dueKm().trim();
    const dueKm = dueKmRaw === '' ? undefined : Number(dueKmRaw);
    const dueDate = this.dueDate().trim() || undefined;
    const partCostRaw = this.partCost().trim();
    const laborCostRaw = this.laborCost().trim();
    if (!Number.isFinite(odometer) || odometer < 0 || !Number.isFinite(cost)) {
      return;
    }
    this.saving.set(true);
    try {
      await this.db.saveMaintenance({
        id: this.editId() ?? undefined,
        type: this.type(),
        cost,
        odometer,
        date: this.date(),
        dueKm,
        dueDate,
        note: this.note().trim() || undefined,
        centerName: this.centerName().trim() || undefined,
        technicianName: this.technicianName().trim() || undefined,
        partBrand: this.partBrand().trim() || undefined,
        partCost: partCostRaw === '' ? undefined : Number(partCostRaw),
        laborCost: laborCostRaw === '' ? undefined : Number(laborCostRaw),
        otherLabel: this.type() === 'other' ? this.otherLabel().trim() || undefined : undefined,
      });
      this.resetForm();
    } finally {
      this.saving.set(false);
    }
  }
}
