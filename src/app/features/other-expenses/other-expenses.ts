import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import type { OtherExpense } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-other-expenses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, TextField, NumericField, DateField, PrimaryButton, ConfirmBar],
  templateUrl: './other-expenses.html',
  styleUrl: './other-expenses.scss',
})
export class OtherExpensesPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly editId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly saving = signal(false);
  readonly label = signal('');
  readonly amount = signal('');
  readonly date = signal(todayDateOnly());
  readonly note = signal('');
  readonly labelError = signal('');
  readonly amountError = signal('');

  readonly list = computed(() =>
    [...this.db.otherExpenses()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  resetForm(): void {
    this.editId.set(null);
    this.label.set('');
    this.amount.set('');
    this.date.set(todayDateOnly());
    this.note.set('');
    this.labelError.set('');
    this.amountError.set('');
  }

  startEdit(row: OtherExpense): void {
    this.editId.set(row.id);
    this.label.set(row.label);
    this.amount.set(String(row.amount));
    this.date.set(row.date);
    this.note.set(row.note ?? '');
  }

  async save(): Promise<void> {
    const label = this.label().trim();
    const amount = Number(this.amount());
    this.labelError.set('');
    this.amountError.set('');
    let ok = true;
    if (!label) {
      this.labelError.set(this.i18n.t('otherExpenses.err.label'));
      ok = false;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      this.amountError.set(this.i18n.t('otherExpenses.err.amount'));
      ok = false;
    }
    if (!ok) {
      return;
    }
    this.saving.set(true);
    try {
      await this.db.saveOtherExpense({
        id: this.editId() ?? undefined,
        label,
        amount,
        date: this.date(),
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
    await this.db.deleteOtherExpense(id);
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
