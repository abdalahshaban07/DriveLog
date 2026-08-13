import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { decodeVin, recallsFor } from '../../data/remote';
import { listCurrencyOptions, validCurrency } from '../../domain/currencies';
import { THEMES, type BackupFile, type Theme } from '../../domain/models';
import { isValidVin, normalizeVin } from '../../domain/vin';
import { I18n } from '../../i18n/i18n';
import { InstallPwa } from '../../pwa/install-pwa';
import { Notify } from '../../pwa/notify';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-settings',
  imports: [PageHeader, SelectField, DateField, ConfirmBar, RouterLink, TextField],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage {
  readonly i18n = inject(I18n);
  readonly install = inject(InstallPwa);
  readonly notify = inject(Notify);
  private readonly db = inject(Db);

  readonly remindersLbl = 'settings-reminders';
  readonly theme = computed(() => this.db.settings().theme);
  readonly remindersEnabled = computed(
    () => this.db.settings().remindersEnabled === true,
  );
  readonly notifyPerm = signal(this.notify.permission());
  readonly themeOptions = computed(() =>
    THEMES.map((value) => ({
      value,
      label: this.i18n.t(`settings.theme.${value}`),
    })),
  );
  readonly currency = signal(validCurrency(this.db.settings().currency));
  readonly langOptions = computed(() => [
    { value: 'en', label: this.i18n.t('settings.lang.en') },
    { value: 'ar', label: this.i18n.t('settings.lang.ar') },
  ]);
  readonly currencyOptions = computed(() =>
    listCurrencyOptions(this.i18n.language(), this.currency()),
  );
  readonly license = signal(this.db.settings().licenseExpiry ?? '');
  readonly registration = signal(this.db.settings().registrationExpiry ?? '');
  readonly pendingImport = signal<BackupFile | null>(null);
  readonly importFileName = signal('');
  readonly importError = signal('');
  readonly importOk = signal(false);
  readonly vin = signal(this.db.car()?.vin ?? '');
  readonly vinBusy = signal(false);
  readonly vinError = signal('');
  readonly carMeta = computed(() => this.db.car());

  notifyStatus(): string {
    const p = this.notifyPerm();
    if (p === 'unsupported' || p === 'denied') {
      return this.i18n.t('due.notificationsUnavailable');
    }
    if (p === 'granted') {
      return this.i18n.t('settings.notificationsOn');
    }
    return this.i18n.t('settings.notificationsOff');
  }

  async onLang(value: string): Promise<void> {
    await this.i18n.setLanguage(value === 'ar' ? 'ar' : 'en');
  }

  async onTheme(value: string): Promise<void> {
    if (!(THEMES as readonly string[]).includes(value)) {
      return;
    }
    await this.db.updateSettings({ theme: value as Theme });
  }

  async onReminders(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    await this.db.updateSettings({ remindersEnabled: on });
  }

  async onCurrency(code: string): Promise<void> {
    this.currency.set(code);
    await this.db.updateSettings({ currency: code });
  }

  async onLicense(value: string): Promise<void> {
    this.license.set(value);
    await this.db.updateSettings({ licenseExpiry: value || undefined });
  }

  async onRegistration(value: string): Promise<void> {
    this.registration.set(value);
    await this.db.updateSettings({ registrationExpiry: value || undefined });
  }

  exportBackup(): void {
    const data = this.db.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drivelog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async onFile(event: Event): Promise<void> {
    this.importError.set('');
    this.importOk.set(false);
    const file = (event.target as HTMLInputElement).files?.[0];
    this.importFileName.set(file?.name ?? '');
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = this.db.validateBackup(JSON.parse(text));
      this.pendingImport.set(parsed);
    } catch {
      this.importError.set(this.i18n.t('backup.failed'));
    }
  }

  async runImport(mode: 'replace' | 'merge'): Promise<void> {
    const backup = this.pendingImport();
    this.pendingImport.set(null);
    if (!backup) {
      return;
    }
    try {
      if (mode === 'replace') {
        await this.db.importReplace(backup);
      } else {
        await this.db.importMerge(backup);
      }
      this.importOk.set(true);
      this.currency.set(this.db.settings().currency);
      this.license.set(this.db.settings().licenseExpiry ?? '');
      this.registration.set(this.db.settings().registrationExpiry ?? '');
      await this.i18n.setLanguage(this.db.settings().language);
    } catch {
      this.importError.set(this.i18n.t('backup.failed'));
    }
  }

  async enableNotify(): Promise<void> {
    await this.notify.requestPermission();
    this.notifyPerm.set(this.notify.permission());
  }

  async doInstall(): Promise<void> {
    await this.install.promptInstall();
  }

  async decodeVin(): Promise<void> {
    const v = normalizeVin(this.vin());
    this.vin.set(v);
    this.vinError.set('');
    if (!v) {
      await this.db.updateCar({
        vin: undefined,
        year: undefined,
        make: undefined,
        model: undefined,
        recallCount: undefined,
      });
      return;
    }
    if (!isValidVin(v)) {
      this.vinError.set(this.i18n.t('vin.invalid'));
      return;
    }
    this.vinBusy.set(true);
    try {
      const decoded = await decodeVin(v);
      if (!decoded) {
        await this.db.updateCar({ vin: v });
        this.vinError.set(this.i18n.t('vin.failed'));
        return;
      }
      let recallCount: number | undefined;
      if (decoded.make && decoded.model && decoded.year) {
        const n = await recallsFor(decoded.make, decoded.model, decoded.year);
        recallCount = n ?? undefined;
      }
      await this.db.updateCar({
        vin: v,
        year: decoded.year,
        make: decoded.make,
        model: decoded.model,
        recallCount,
      });
    } finally {
      this.vinBusy.set(false);
    }
  }

  nhtsaUrl(vin: string): string {
    return `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`;
  }
}
