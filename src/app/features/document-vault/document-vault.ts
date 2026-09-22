import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import {
  docUrgency,
  sortDocsByUrgency,
  type DocUrgency,
} from '../../domain/vehicle-docs';
import type { VehicleDocKind, VehicleDocument } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

const KINDS: { id: VehicleDocKind; labelKey: MsgKey }[] = [
  { id: 'license', labelKey: 'vault.kind.license' },
  { id: 'registration', labelKey: 'vault.kind.registration' },
  { id: 'insurance', labelKey: 'vault.kind.insurance' },
  { id: 'inspection', labelKey: 'vault.kind.inspection' },
  { id: 'other', labelKey: 'vault.kind.other' },
];

@Component({
  selector: 'app-document-vault',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, TextField, DateField, SelectField, PrimaryButton, ConfirmBar],
  templateUrl: './document-vault.html',
  styleUrl: './document-vault.scss',
})
export class DocumentVaultPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly editId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly saving = signal(false);
  readonly kind = signal('license');
  readonly label = signal('');
  readonly expiryDate = signal(todayDateOnly());
  readonly note = signal('');
  readonly expiryError = signal('');

  readonly kindOptions = computed(() =>
    KINDS.map((k) => ({ value: k.id, label: this.i18n.t(k.labelKey) })),
  );

  readonly list = computed(() => sortDocsByUrgency(this.db.vehicleDocuments()));

  resetForm(): void {
    this.editId.set(null);
    this.kind.set('license');
    this.label.set('');
    this.expiryDate.set(todayDateOnly());
    this.note.set('');
    this.expiryError.set('');
  }

  startEdit(row: VehicleDocument): void {
    this.editId.set(row.id);
    this.kind.set(row.kind);
    this.label.set(row.label ?? '');
    this.expiryDate.set(row.expiryDate);
    this.note.set(row.note ?? '');
  }

  kindLabel(kind: VehicleDocKind): string {
    return this.i18n.t(`vault.kind.${kind}` as MsgKey);
  }

  urgencyClass(expiry: string): DocUrgency {
    return docUrgency(expiry);
  }

  urgencyLabel(expiry: string): string {
    const u = docUrgency(expiry);
    return this.i18n.t(`vault.urgency.${u}` as MsgKey);
  }

  async save(): Promise<void> {
    const expiry = this.expiryDate().trim();
    this.expiryError.set('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      this.expiryError.set(this.i18n.t('vault.err.expiry'));
      return;
    }
    this.saving.set(true);
    try {
      await this.db.saveVehicleDocument({
        id: this.editId() ?? undefined,
        kind: this.kind() as VehicleDocKind,
        label: this.label(),
        expiryDate: expiry,
        note: this.note(),
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
    await this.db.deleteVehicleDocument(id);
  }
}
