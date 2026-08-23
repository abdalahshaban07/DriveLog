import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import {
  addMilestoneAfter,
  completeTask,
  sortMilestones,
  taskKmRemaining,
} from '../../domain/milestones';
import type {
  Maintenance,
  MaintenanceMilestone,
  MaintenanceTask,
  MaintenanceType,
  MilestoneTaskKind,
} from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

type CompletingTask = { milestoneId: string; taskId: string };

@Component({
  selector: 'app-maintenance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, TextField, NumericField, DateField, PrimaryButton, ConfirmBar],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.scss',
})
export class MaintenancePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly completing = signal<CompletingTask | null>(null);
  readonly cost = signal('');
  readonly odometer = signal(String(this.db.car()?.currentOdometer ?? ''));
  readonly date = signal(todayDateOnly());
  readonly note = signal('');
  readonly saving = signal(false);
  readonly addingMilestone = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly editId = signal<string | null>(null);
  readonly odoError = signal('');
  readonly costError = signal('');

  readonly sortedMilestones = computed(() => sortMilestones(this.db.milestones()));
  readonly currentOdometer = computed(() => this.db.car()?.currentOdometer ?? 0);

  readonly history = computed(() =>
    [...this.db.maintenance()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  taskLabel(task: MaintenanceTask): string {
    if (task.kind === 'custom' && task.label) {
      return task.label;
    }
    return this.i18n.t(`milestone.task.${task.kind}` as MsgKey);
  }

  taskRemaining(task: MaintenanceTask, milestone: MaintenanceMilestone): number {
    return taskKmRemaining(task, milestone, this.currentOdometer());
  }

  isTaskOpen(task: MaintenanceTask): boolean {
    return !task.maintenanceId;
  }

  startComplete(milestoneId: string, taskId: string): void {
    this.completing.set({ milestoneId, taskId });
    this.cost.set('');
    this.odometer.set(String(this.db.car()?.currentOdometer ?? ''));
    this.date.set(todayDateOnly());
    this.note.set('');
    this.odoError.set('');
    this.costError.set('');
  }

  cancelComplete(): void {
    this.completing.set(null);
    this.odoError.set('');
    this.costError.set('');
  }

  async onScheduledDate(milestone: MaintenanceMilestone, value: string): Promise<void> {
    await this.db.saveMilestone({
      ...milestone,
      scheduledDate: value.trim() || undefined,
    });
  }

  async addMilestone(): Promise<void> {
    const car = this.db.car();
    if (!car) {
      return;
    }
    this.addingMilestone.set(true);
    try {
      const next = addMilestoneAfter(car.id, this.db.milestones(), car.currentOdometer);
      await this.db.saveMilestone(next);
    } finally {
      this.addingMilestone.set(false);
    }
  }

  async saveComplete(): Promise<void> {
    const ctx = this.completing();
    if (!ctx) {
      return;
    }
    const milestone = this.db.milestones().find((m) => m.id === ctx.milestoneId);
    const task = milestone?.tasks.find((t) => t.id === ctx.taskId);
    if (!milestone || !task) {
      return;
    }
    const cost = Number(this.cost() || '0');
    const odometer = Number(this.odometer());
    this.odoError.set('');
    this.costError.set('');
    let invalid = false;
    if (!Number.isFinite(odometer) || odometer < 0) {
      this.odoError.set(this.i18n.t('maint.err.odometer'));
      invalid = true;
    }
    if (!Number.isFinite(cost)) {
      this.costError.set(this.i18n.t('maint.err.cost'));
      invalid = true;
    }
    if (invalid) {
      return;
    }
    const { type, otherLabel } = taskMaintenanceFields(task);
    const maintenanceId = crypto.randomUUID();
    this.saving.set(true);
    try {
      await this.db.saveMaintenance({
        id: maintenanceId,
        type,
        cost,
        odometer,
        date: this.date(),
        note: this.note().trim() || undefined,
        otherLabel,
      });
      await this.db.saveMilestone(completeTask(milestone, task.id, maintenanceId, odometer));
      this.cancelComplete();
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
    if (!id) {
      return;
    }
    await this.db.deleteMaintenance(id);
    this.pendingDelete.set(null);
    if (this.editId() === id) {
      this.editId.set(null);
    }
  }

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value} ${this.db.settings().currency}`;
    }
  }
}

function taskMaintenanceFields(task: MaintenanceTask): {
  type: MaintenanceType;
  otherLabel?: string;
} {
  switch (task.kind) {
    case 'oil':
    case 'filter':
    case 'tires':
    case 'brakes':
      return { type: task.kind };
    case 'labor':
      return { type: 'other', otherLabel: 'Labor' };
    case 'custom':
      return { type: 'other', otherLabel: task.label?.trim() || 'Custom' };
    default: {
      const _never: never = task.kind;
      return _never;
    }
  }
}
