import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import {
  docUrgency,
  sortDocsByUrgency,
  vaultDayParts,
  type DocUrgency,
  type VaultDayTone,
} from '../../domain/vehicle-docs';
import type { VehicleDocKind, VehicleDocument } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

const KINDS: { id: VehicleDocKind; labelKey: MsgKey }[] = [
  { id: 'license', labelKey: 'vault.kind.license' },
  { id: 'registration', labelKey: 'vault.kind.registration' },
  { id: 'insurance', labelKey: 'vault.kind.insurance' },
  { id: 'inspection', labelKey: 'vault.kind.inspection' },
  { id: 'other', labelKey: 'vault.kind.other' },
];

const DAY_UNIT: Record<VaultDayTone, MsgKey> = {
  left: 'vault.unit.left',
  over: 'vault.unit.over',
  today: 'vault.unit.today',
};

@Component({
  selector: 'app-document-vault',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, PageHeader, TextField, DateField, PrimaryButton, ConfirmBar],
  templateUrl: './document-vault.html',
  styleUrl: './document-vault.scss',
})
export class DocumentVaultPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  private readonly composerEl = viewChild<ElementRef<HTMLElement>>('composer');

  readonly editId = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly saving = signal(false);
  readonly composerOpen = signal(false);
  readonly kind = signal<VehicleDocKind>('license');
  readonly label = signal('');
  readonly expiryDate = signal(todayDateOnly());
  readonly note = signal('');
  readonly expiryError = signal('');

  readonly kindOptions = computed(() =>
    KINDS.map((k) => ({ value: k.id, label: this.i18n.t(k.labelKey) })),
  );

  readonly list = computed(() => sortDocsByUrgency(this.db.vehicleDocuments()));

  readonly showForm = computed(() => this.composerOpen() || this.list().length === 0);

  readonly stats = computed(() => {
    const docs = this.list();
    let valid = 0;
    let soon = 0;
    let expired = 0;
    for (const doc of docs) {
      const urgency = docUrgency(doc.expiryDate);
      if (urgency === 'expired') {
        expired += 1;
      } else if (urgency === 'ok') {
        valid += 1;
      } else {
        soon += 1;
      }
    }
    return { total: docs.length, valid, soon, expired, next: docs[0] ?? null };
  });

  readonly kindHint = computed(() =>
    this.i18n.t(`vault.kindHint.${this.kind()}` as MsgKey),
  );

  openComposer(): void {
    this.composerOpen.set(true);
  }

  resetForm(): void {
    this.editId.set(null);
    this.composerOpen.set(false);
    this.kind.set('license');
    this.label.set('');
    this.expiryDate.set(todayDateOnly());
    this.note.set('');
    this.expiryError.set('');
  }

  startEdit(row: VehicleDocument): void {
    this.editId.set(row.id);
    this.composerOpen.set(true);
    this.kind.set(row.kind);
    this.label.set(row.label ?? '');
    this.expiryDate.set(row.expiryDate);
    this.note.set(row.note ?? '');
    this.expiryError.set('');
    setTimeout(() => {
      this.composerEl()?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  }

  kindLabel(kind: VehicleDocKind): string {
    return this.i18n.t(`vault.kind.${kind}` as MsgKey);
  }

  docTitle(row: VehicleDocument): string {
    const custom = row.label?.trim();
    if (row.kind === 'other' && custom) {
      return custom;
    }
    return this.kindLabel(row.kind);
  }

  docKicker(row: VehicleDocument): string {
    const custom = row.label?.trim();
    if (row.kind === 'other' && custom) {
      return this.kindLabel('other');
    }
    return '';
  }

  urgencyClass(expiry: string): DocUrgency {
    return docUrgency(expiry);
  }

  urgencyLabel(expiry: string): string {
    const u = docUrgency(expiry);
    return this.i18n.t(`vault.urgency.${u}` as MsgKey);
  }

  dayTone(expiry: string): VaultDayTone {
    return vaultDayParts(expiry).tone;
  }

  dayCount(expiry: string): number {
    return vaultDayParts(expiry).count;
  }

  dayUnit(expiry: string): string {
    return this.i18n.t(DAY_UNIT[vaultDayParts(expiry).tone]);
  }

  daySentence(expiry: string): string {
    const parts = vaultDayParts(expiry);
    switch (parts.tone) {
      case 'today':
        return this.i18n.t('vault.dueToday');
      case 'over':
        return this.i18n.t('vault.daysOver', { days: parts.count });
      case 'left':
        return this.i18n.t('vault.daysLeft', { days: parts.count });
      default: {
        const _never: never = parts.tone;
        return _never;
      }
    }
  }

  longDate(expiry: string): string {
    return this.i18n.formatDate(expiry, { day: 'numeric', month: 'long', year: 'numeric' });
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
        kind: this.kind(),
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
