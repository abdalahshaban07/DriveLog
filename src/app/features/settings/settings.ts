import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { getCoords, restCountryCurrencies, sunTimes } from '../../data/remote';
import { listCurrencyOptions, validCurrency } from '../../domain/currencies';
import { THEMES, type BackupFile, type Theme } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import { InstallPwa } from '../../pwa/install-pwa';
import { Notify } from '../../pwa/notify';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { SelectField } from '../../ui/select-field';

type DestructiveAction = 'removeCar' | 'startFresh';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, SelectField, DateField, ConfirmBar, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage {
  readonly i18n = inject(I18n);
  readonly install = inject(InstallPwa);
  readonly notify = inject(Notify);
  readonly db = inject(Db);
  private readonly router = inject(Router);

  readonly remindersLbl = 'settings-reminders';
  readonly theme = computed(() => this.db.settings().theme);
  readonly remindersEnabled = computed(() => this.db.settings().remindersEnabled === true);
  readonly notifyPerm = signal(this.notify.permission());
  readonly themeOptions = computed(() =>
    THEMES.map((value) => ({
      value,
      label: this.i18n.t(`settings.theme.${value}`),
    })),
  );
  readonly currency = signal(validCurrency(this.db.settings().currency));
  readonly restCurrencies = signal<Awaited<ReturnType<typeof restCountryCurrencies>>>([]);
  readonly duskHint = signal('');
  readonly carOptions = computed(() =>
    this.db.cars().map((c) => ({ value: c.id, label: c.nickname })),
  );
  readonly showCarSwitcher = computed(() => this.db.cars().length > 1);
  readonly duskAssistEnabled = computed(() => this.db.settings().duskAssistEnabled === true);
  readonly langOptions = computed(() => [
    { value: 'en', label: this.i18n.t('settings.lang.en') },
    { value: 'ar', label: this.i18n.t('settings.lang.ar') },
  ]);
  readonly currencyOptions = computed(() =>
    listCurrencyOptions(this.i18n.language(), this.currency(), this.restCurrencies()),
  );
  readonly license = signal(this.db.settings().licenseExpiry ?? '');
  readonly registration = signal(this.db.settings().registrationExpiry ?? '');
  readonly pendingImport = signal<BackupFile | null>(null);
  readonly pendingDestructive = signal<DestructiveAction | null>(null);
  readonly importFileName = signal('');
  readonly importError = signal('');
  readonly importOk = signal(false);

  constructor() {
    void this.loadRestCurrencies();
    void this.loadDuskHint();
  }

  async loadRestCurrencies(): Promise<void> {
    this.restCurrencies.set(await restCountryCurrencies());
  }

  async loadDuskHint(): Promise<void> {
    if (!this.duskAssistEnabled()) {
      this.duskHint.set('');
      return;
    }
    const coords = await getCoords();
    if (!coords) {
      return;
    }
    const times = await sunTimes(coords.lat, coords.lon);
    if (!times) {
      return;
    }
    const sunset = new Date(times.sunset);
    const now = new Date();
    const diffMin = Math.round((sunset.getTime() - now.getTime()) / 60_000);
    if (diffMin >= 0 && diffMin <= 90) {
      this.duskHint.set(
        this.i18n.t('settings.duskHint', {
          time: sunset.toLocaleTimeString(this.i18n.language(), {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }),
      );
    }
  }

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

  async onCar(value: string): Promise<void> {
    await this.db.switchCar(value);
  }

  async onDuskAssist(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    await this.db.updateSettings({ duskAssistEnabled: on });
    if (on) {
      await this.loadDuskHint();
    } else {
      this.duskHint.set('');
    }
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
    this.pendingDestructive.set(null);
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

  askRemoveCar(): void {
    if (!this.db.hasCar()) {
      return;
    }
    this.pendingImport.set(null);
    this.pendingDestructive.set('removeCar');
  }

  askStartFresh(): void {
    this.pendingImport.set(null);
    this.pendingDestructive.set('startFresh');
  }

  destructiveMessage(): string {
    const action = this.pendingDestructive();
    if (action === 'removeCar') {
      return this.i18n.t('settings.removeCarConfirm');
    }
    if (action === 'startFresh') {
      return this.i18n.t('settings.startFreshConfirm');
    }
    return '';
  }

  destructiveConfirmLabel(): string {
    const action = this.pendingDestructive();
    if (action === 'removeCar') {
      return this.i18n.t('settings.removeCar');
    }
    if (action === 'startFresh') {
      return this.i18n.t('settings.startFresh');
    }
    return this.i18n.t('common.confirm');
  }

  async runDestructive(): Promise<void> {
    const action = this.pendingDestructive();
    this.pendingDestructive.set(null);
    if (action === 'startFresh') {
      await this.db.wipeAll();
      await this.router.navigateByUrl('/setup');
      return;
    }
    if (action === 'removeCar') {
      const id = this.db.car()?.id;
      if (!id) {
        return;
      }
      await this.db.removeCar(id);
      if (!this.db.hasCar()) {
        await this.router.navigateByUrl('/setup');
      }
    }
  }
}
