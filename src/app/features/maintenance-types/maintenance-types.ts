import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { addCustomMaintenanceType } from '../../domain/maintenance-fields';
import { MAINTENANCE_TYPES } from '../../domain/models';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { ConfirmBar } from '../../ui/confirm-bar';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-maintenance-types',
  imports: [PageHeader, TextField, PrimaryButton, ConfirmBar],
  templateUrl: './maintenance-types.html',
  styleUrl: './maintenance-types.scss',
})
export class MaintenanceTypesPage {
  readonly i18n = inject(I18n);
  readonly router = inject(Router);
  private readonly db = inject(Db);

  readonly name = signal('');
  readonly error = signal('');
  readonly pending = signal<string | null>(null);

  readonly builtins = computed(() => {
    this.i18n.language();
    return MAINTENANCE_TYPES.filter((value) => value !== 'other').map((value) => ({
      value,
      label: this.i18n.t(`maintenance.type.${value}` as MsgKey),
    }));
  });

  readonly customs = computed(() => this.db.settings().customMaintenanceTypes ?? []);

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.add();
  }

  async add(): Promise<void> {
    this.error.set('');
    const reserved = [
      ...MAINTENANCE_TYPES,
      ...MAINTENANCE_TYPES.map((t) => this.i18n.t(`maintenance.type.${t}` as MsgKey)),
      ...this.customs(),
    ];
    const result = addCustomMaintenanceType(reserved, this.name());
    if (!result.ok) {
      this.error.set(
        result.reason === 'empty'
          ? this.i18n.t('types.err.empty')
          : this.i18n.t('types.err.duplicate'),
      );
      return;
    }
    await this.db.addCustomType(result.name);
    this.name.set('');
  }

  askDelete(name: string): void {
    this.pending.set(name);
  }

  async doDelete(): Promise<void> {
    const name = this.pending();
    if (!name) {
      return;
    }
    await this.db.removeCustomType(name);
    this.pending.set(null);
  }
}
