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
import { odometerInputValue } from '../../domain/odometer';
import {
  decryptBackup,
  isEncryptedBackup,
  type EncryptedBackup,
} from '../../domain/backup-crypto';
import { THEMES, LOOKS, type BackupFile, type Look, type Theme } from '../../domain/models';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { AutoBackup } from '../../pwa/auto-backup';
import { InstallPwa } from '../../pwa/install-pwa';
import { Notify } from '../../pwa/notify';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

type DestructiveAction = 'removeCar' | 'startFresh';

const SOON_PRESETS = [
  { ratio: 0.1, labelKey: 'settings.soonThreshold.late' as MsgKey },
  { ratio: 0.2, labelKey: 'settings.soonThreshold.default' as MsgKey },
  { ratio: 0.3, labelKey: 'settings.soonThreshold.early' as MsgKey },
] as const;

function snapSoonRatio(raw: number | undefined): number {
  const n = Number.isFinite(raw) ? Number(raw) : 0.2;
  let best: number = SOON_PRESETS[1]!.ratio;
  let bestDist = Infinity;
  for (const p of SOON_PRESETS) {
    const d = Math.abs(p.ratio - n);
    if (d < bestDist) {
      bestDist = d;
      best = p.ratio;
    }
  }
  return best;
}

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
  readonly router = inject(Router);
  readonly autoBackup = inject(AutoBackup);

  readonly remindersLbl = 'settings-reminders';
  readonly assistantOnlineLbl = 'settings-assistant-online';
  readonly theme = computed(() => this.db.settings().theme);
  readonly look = computed(() => this.db.settings().look);
  readonly remindersEnabled = computed(() => this.db.settings().remindersEnabled === true);
  /** Online AI default on when undefined. */
  readonly assistantOnline = computed(() => this.db.settings().assistantEnabled !== false);
  readonly notifyMaintenance = computed(() => this.db.settings().notifyMaintenance !== false);
  readonly notifyBudget = computed(() => this.db.settings().notifyBudget !== false);
  readonly notifyForecast = computed(() => this.db.settings().notifyForecast !== false);
  readonly notifyFuelPrices = computed(() => this.db.settings().notifyFuelPrices !== false);
  readonly soonPresets = SOON_PRESETS;
  readonly soonRatio = signal(snapSoonRatio(this.db.settings().soonThresholdRatio));
  readonly soonPercent = computed(() => Math.round(this.soonRatio() * 100));
  readonly soonExampleKm = computed(() => Math.round(10_000 * this.soonRatio()));
  readonly notifyPerm = signal(this.notify.permission());
  readonly themeOptions = computed(() =>
    THEMES.map((value) => ({
      value,
      label: this.i18n.t(`settings.theme.${value}`),
    })),
  );
  readonly lookOptions = computed(() =>
    LOOKS.map((value) => ({
      value,
      label: this.i18n.t(`settings.look.${value}`),
    })),
  );
  readonly currency = signal(validCurrency(this.db.settings().currency));
  readonly restCurrencies = signal<Awaited<ReturnType<typeof restCountryCurrencies>>>([]);
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
  readonly correctOdometer = signal(odometerInputValue(this.db.car()?.currentOdometer));
  readonly tankCapacityError = signal('');
  readonly odometerError = signal('');
  readonly pendingImport = signal<BackupFile | null>(null);
  readonly pendingDestructive = signal<DestructiveAction | null>(null);
  readonly importFileName = signal('');
  readonly importError = signal('');
  readonly importOk = signal(false);
  readonly pendingEncrypted = signal<EncryptedBackup | null>(null);
  readonly decryptPass = signal('');
  readonly decryptError = signal('');
  readonly backupPass = signal(this.autoBackup.state()?.passphrase ?? '');
  readonly autoBusy = signal(false);
  readonly autoBackupError = signal('');
  readonly autoBackupOk = signal(false);
  readonly passSaved = signal(false);
  readonly lastBackupLabel = computed(() => {
    const at = this.autoBackup.state()?.lastBackupAt;
    if (!at) {
      return this.i18n.t('backup.never');
    }
    return this.i18n.formatDate(new Date(at), { dateStyle: 'medium' });
  });

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

  async onLook(value: string): Promise<void> {
    if (!(LOOKS as readonly string[]).includes(value)) {
      return;
    }
    await this.db.updateSettings({ look: value as Look });
  }

  async onReminders(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    await this.db.updateSettings({ remindersEnabled: on });
  }

  async onAssistantOnline(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    await this.db.updateSettings({ assistantEnabled: on });
  }

  async onNotifyFlag(
    key: 'notifyMaintenance' | 'notifyBudget' | 'notifyForecast' | 'notifyFuelPrices',
    event: Event,
  ): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    await this.db.updateSettings({ [key]: on });
  }

  async setSoonPreset(ratio: number): Promise<void> {
    const n = snapSoonRatio(ratio);
    this.soonRatio.set(n);
    await this.db.updateSettings({ soonThresholdRatio: n });
  }

  async onCurrency(code: string): Promise<void> {
    this.currency.set(code);
    await this.db.updateSettings({ currency: code });
  }

  private syncCarFields(): void {
    const car = this.db.car();
    this.plate.set(car?.plate ?? '');
    this.license.set(car?.licenseExpiry ?? '');
    this.registration.set(car?.registrationExpiry ?? '');
    this.tankCapacity.set(
      car?.tankCapacityLiters != null ? String(car.tankCapacityLiters) : '',
    );
    this.correctOdometer.set(odometerInputValue(car?.currentOdometer));
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
    this.pendingImport.set(null);
    this.pendingDestructive.set(null);
    this.pendingEncrypted.set(null);
    this.decryptPass.set('');
    this.decryptError.set('');
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Allow re-selecting the same file after a cancel or failed import.
    input.value = '';
    this.importFileName.set(file?.name ?? '');
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      if (isEncryptedBackup(raw)) {
        this.pendingEncrypted.set(raw);
        return;
      }
      const parsed = this.db.validateBackup(raw);
      this.pendingImport.set(parsed);
    } catch {
      this.importError.set(this.i18n.t('backup.failed'));
    }
  }

  async decryptPending(): Promise<void> {
    const enc = this.pendingEncrypted();
    if (!enc) {
      return;
    }
    this.decryptError.set('');
    try {
      const text = await decryptBackup(enc, this.decryptPass());
      const parsed = this.db.validateBackup(JSON.parse(text));
      this.pendingEncrypted.set(null);
      this.decryptPass.set('');
      this.pendingImport.set(parsed);
    } catch {
      this.decryptError.set(this.i18n.t('backup.decryptWrong'));
    }
  }

  cancelDecrypt(): void {
    this.pendingEncrypted.set(null);
    this.decryptPass.set('');
    this.decryptError.set('');
    this.importFileName.set('');
  }

  async chooseBackupFolder(): Promise<void> {
    this.autoBackupError.set('');
    this.autoBackupOk.set(false);
    this.autoBusy.set(true);
    try {
      const ok = await this.autoBackup.chooseFolder();
      if (this.autoBackup.connected()) {
        if (ok) {
          this.autoBackupOk.set(true);
        } else {
          this.autoBackupError.set(this.i18n.t('backup.writeFailed'));
        }
      }
    } finally {
      this.autoBusy.set(false);
    }
  }

  async runAutoBackup(): Promise<void> {
    this.autoBackupError.set('');
    this.autoBackupOk.set(false);
    this.autoBusy.set(true);
    try {
      const ok = await this.autoBackup.grantAndBackUp();
      if (ok) {
        this.autoBackupOk.set(true);
      } else {
        this.autoBackupError.set(this.i18n.t('backup.writeFailed'));
      }
    } finally {
      this.autoBusy.set(false);
    }
  }

  async saveBackupPassphrase(): Promise<void> {
    await this.autoBackup.setPassphrase(this.backupPass().trim());
    this.passSaved.set(true);
  }

  async stopAutoBackup(): Promise<void> {
    await this.autoBackup.disconnect();
    this.backupPass.set('');
    this.autoBackupOk.set(false);
    this.autoBackupError.set('');
    this.passSaved.set(false);
  }

  async runImport(mode: 'replace' | 'merge'): Promise<void> {
    const backup = this.pendingImport();
    if (!backup) {
      return;
    }
    try {
      if (mode === 'replace') {
        await this.db.importReplace(backup);
      } else {
        await this.db.importMerge(backup);
      }
      this.pendingImport.set(null);
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
