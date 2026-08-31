import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { restCountryCurrencies } from '../../data/remote';
import { listCurrencyOptions, validCurrency } from '../../domain/currencies';
import {
  maxLoggedOdometer,
  TANK_MAX,
  TANK_MIN,
} from '../../domain/fill-up-distance';
import { THEMES, type BackupFile, type Theme } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import { InstallPwa } from '../../pwa/install-pwa';
import { Notify } from '../../pwa/notify';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

type DestructiveAction = 'removeCar' | 'startFresh';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    SelectField,
    DateField,
    ConfirmBar,
    RouterLink,
    TextField,
    NumericField,
  ],
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
  readonly carOptions = computed(() =>
    this.db.cars().map((c) => ({ value: c.id, label: c.nickname })),
  );
  readonly showCarSwitcher = computed(() => this.db.cars().length > 1);
  readonly langOptions = computed(() => [
    { value: 'en', label: this.i18n.t('settings.lang.en') },
    { value: 'ar', label: this.i18n.t('settings.lang.ar') },
  ]);
  readonly currencyOptions = computed(() =>
    listCurrencyOptions(this.i18n.language(), this.currency(), this.restCurrencies()),
  );
  readonly plate = signal(this.db.car()?.plate ?? '');
  readonly license = signal(this.db.car()?.licenseExpiry ?? '');
  readonly registration = signal(this.db.car()?.registrationExpiry ?? '');
  readonly tankCapacity = signal(
    this.db.car()?.tankCapacityLiters != null ? String(this.db.car()!.tankCapacityLiters) : '',
  );
  readonly correctOdometer = signal(String(this.db.car()?.currentOdometer ?? ''));
  readonly tankCapacityError = signal('');
  readonly odometerError = signal('');
  readonly pendingImport = signal<BackupFile | null>(null);
  readonly pendingDestructive = signal<DestructiveAction | null>(null);
  readonly importFileName = signal('');
  readonly importError = signal('');
  readonly importOk = signal(false);

  readonly showTankBanner = computed(() => this.db.car()?.tankCapacityLiters == null);

  readonly odometerFloor = computed(() => {
    const car = this.db.car();
    if (!car) {
      return 0;
    }
    return maxLoggedOdometer(car, this.db.fillUps(), this.db.maintenance(), this.db.breakdowns());
  });

  constructor() {
    void this.loadRestCurrencies();
  }

  async loadRestCurrencies(): Promise<void> {
    this.restCurrencies.set(await restCountryCurrencies());
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
    this.syncCarFields();
  }

  private syncCarFields(): void {
    const car = this.db.car();
    this.plate.set(car?.plate ?? '');
    this.license.set(car?.licenseExpiry ?? '');
    this.registration.set(car?.registrationExpiry ?? '');
    this.tankCapacity.set(
      car?.tankCapacityLiters != null ? String(car.tankCapacityLiters) : '',
    );
    this.correctOdometer.set(String(car?.currentOdometer ?? ''));
    this.tankCapacityError.set('');
    this.odometerError.set('');
  }

  async onPlate(value: string): Promise<void> {
    this.plate.set(value);
    await this.db.updateCar({ plate: value.trim() || undefined });
  }

  async onLicense(value: string): Promise<void> {
    this.license.set(value);
    await this.db.updateCar({ licenseExpiry: value || undefined });
  }

  async onRegistration(value: string): Promise<void> {
    this.registration.set(value);
    await this.db.updateCar({ registrationExpiry: value || undefined });
  }

  async onTankCapacity(value: string): Promise<void> {
    this.tankCapacity.set(value);
    const n = Number(value);
    if (!Number.isFinite(n) || n < TANK_MIN || n > TANK_MAX) {
      this.tankCapacityError.set(this.i18n.t('setup.err.tankCapacity'));
      return;
    }
    this.tankCapacityError.set('');
    await this.db.updateCar({ tankCapacityLiters: n });
  }

  async onCorrectOdometer(value: string): Promise<void> {
    this.correctOdometer.set(value);
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      this.odometerError.set(this.i18n.t('setup.err.odometer'));
      return;
    }
    const floor = this.odometerFloor();
    if (n < floor) {
      this.odometerError.set(this.i18n.t('settings.err.odometerFloor'));
      return;
    }
    this.odometerError.set('');
    await this.db.updateCar({ currentOdometer: n });
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
      this.syncCarFields();
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
