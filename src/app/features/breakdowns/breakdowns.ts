import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import type { Breakdown, BreakdownCategory } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-breakdowns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    TextField,
    NumericField,
    DateField,
    SelectField,
    PrimaryButton,
    ConfirmBar,
  ],
  templateUrl: './breakdowns.html',
  styleUrl: './breakdowns.scss',
})
export class BreakdownsPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly editId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly saving = signal(false);
  readonly symptom = signal('');
  readonly repairCost = signal('');
  readonly odometer = signal(String(this.db.car()?.currentOdometer ?? ''));
  readonly date = signal(todayDateOnly());
  readonly shopName = signal('');
  readonly category = signal<BreakdownCategory>('mechanical');
  readonly note = signal('');
  readonly symptomError = signal('');
  readonly costError = signal('');
  readonly odoError = signal('');

  readonly list = computed(() =>
    [...this.db.breakdowns()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  readonly categoryOptions = computed(() =>
    (['mechanical', 'electrical', 'other'] as BreakdownCategory[]).map((value) => ({
      value,
      label: this.i18n.t(`breakdowns.category.${value}` as MsgKey),
    })),
  );

  categoryLabel(cat: BreakdownCategory): string {
    return this.i18n.t(`breakdowns.category.${cat}` as MsgKey);
  }

  resetForm(): void {
    this.editId.set(null);
    this.symptom.set('');
    this.repairCost.set('');
    this.odometer.set(String(this.db.car()?.currentOdometer ?? ''));
    this.date.set(todayDateOnly());
    this.shopName.set('');
    this.category.set('mechanical');
    this.note.set('');
    this.symptomError.set('');
    this.costError.set('');
    this.odoError.set('');
  }

  startEdit(row: Breakdown): void {
    this.editId.set(row.id);
    this.symptom.set(row.symptom);
    this.repairCost.set(String(row.repairCost));
    this.odometer.set(String(row.odometer));
    this.date.set(row.date);
    this.shopName.set(row.shopName ?? '');
    this.category.set(row.category);
    this.note.set(row.note ?? '');
  }

  async save(): Promise<void> {
    const symptom = this.symptom().trim();
    const cost = Number(this.repairCost());
    const odo = Number(this.odometer());
    this.symptomError.set('');
    this.costError.set('');
    this.odoError.set('');
    let ok = true;
    if (!symptom) {
      this.symptomError.set(this.i18n.t('breakdowns.err.symptom'));
      ok = false;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      this.costError.set(this.i18n.t('breakdowns.err.cost'));
      ok = false;
    }
    if (!Number.isFinite(odo) || odo < 0) {
      this.odoError.set(this.i18n.t('breakdowns.err.odometer'));
      ok = false;
    }
    if (!ok) {
      return;
    }
    this.saving.set(true);
    try {
      await this.db.saveBreakdown({
        id: this.editId() ?? undefined,
        symptom,
        repairCost: cost,
        odometer: odo,
        date: this.date(),
        shopName: this.shopName().trim() || undefined,
        category: this.category(),
        note: this.note().trim() || undefined,
      });
      this.resetForm();
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(id: string): void {
    this.pendingDelete.set(id);
  }

  async confirmDelete(): Promise<void> {
    const id = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!id) {
      return;
    }
    if (this.editId() === id) {
      this.resetForm();
    }
    await this.db.deleteBreakdown(id);
  }

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${value}`;
    }
  }
}
