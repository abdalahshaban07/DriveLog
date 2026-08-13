import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Db } from '../../data/db';
import { currentWeather, getCoords } from '../../data/remote';
import { todayDateOnly } from '../../domain/dues';
import { weatherMsgKey } from '../../domain/weather';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { PumpDisplay } from '../../ui/pump-display';
import { PumpKeypad } from '../../ui/pump-keypad';
import { TankToggle } from '../../ui/tank-toggle';

type Field = 'odometer' | 'liters' | 'cost';

@Component({
  selector: 'app-fill-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    PumpDisplay,
    PumpKeypad,
    TankToggle,
    DateField,
    PrimaryButton,
    ConfirmBar,
    DecimalPipe,
  ],
  templateUrl: './fill-up.html',
  styleUrl: './fill-up.scss',
})
export class FillUpPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly active = signal<Field>('odometer');
  readonly odometer = signal('');
  readonly liters = signal('');
  readonly cost = signal('');
  readonly tankFull = signal(true);
  readonly date = signal(todayDateOnly());
  readonly dateError = signal('');
  readonly odoError = signal('');
  readonly litersError = signal('');
  readonly costError = signal('');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly confirmDelete = signal(false);
  readonly weatherBusy = signal(false);
  readonly weatherError = signal('');
  readonly weather = signal<{
    lat: number;
    lon: number;
    tempC: number;
    weatherCode: number;
  } | null>(null);

  readonly recent = computed(() =>
    [...this.db.fillUps()].sort((a, b) => b.odometer - a.odometer).slice(0, 20),
  );

  readonly canSave = computed(() => {
    const odo = Number(this.odometer());
    const liters = Number(this.liters());
    const cost = Number(this.cost() || '0');
    return (
      Number.isFinite(odo) &&
      odo > 0 &&
      Number.isFinite(liters) &&
      liters > 0 &&
      Number.isFinite(cost) &&
      cost >= 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(this.date()) &&
      !this.saving()
    );
  });

  constructor() {
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.load(id);
    } else {
      const car = this.db.car();
      if (car) {
        this.odometer.set(String(car.currentOdometer));
      }
    }
  }

  load(id: string): void {
    const existing = this.db.fillUps().find((f) => f.id === id);
    if (!existing) {
      return;
    }
    this.editId.set(id);
    this.odometer.set(String(existing.odometer));
    this.liters.set(String(existing.liters));
    this.cost.set(String(existing.cost));
    this.tankFull.set(existing.tankFull);
    this.date.set(existing.date);
    this.weather.set(
      existing.tempC != null && existing.weatherCode != null
        ? {
            lat: existing.lat ?? 0,
            lon: existing.lon ?? 0,
            tempC: existing.tempC,
            weatherCode: existing.weatherCode,
          }
        : null,
    );
    this.odoError.set('');
    this.litersError.set('');
    this.costError.set('');
    this.dateError.set('');
    this.weatherError.set('');
  }

  weatherLabel(code: number): string {
    return this.i18n.t(weatherMsgKey(code) as MsgKey);
  }

  async attachWeather(): Promise<void> {
    this.weatherError.set('');
    this.weatherBusy.set(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        this.weatherError.set(this.i18n.t('home.nearbyGpsDenied'));
        return;
      }
      const w = await currentWeather(coords.lat, coords.lon);
      if (!w) {
        this.weatherError.set(this.i18n.t('fillUp.weatherFailed'));
        return;
      }
      this.weather.set(w);
    } finally {
      this.weatherBusy.set(false);
    }
  }

  fieldLabel(f: Field): string {
    if (f === 'odometer') {
      return this.i18n.t('fillUp.odometer');
    }
    if (f === 'liters') {
      return this.i18n.t('fillUp.liters');
    }
    return this.i18n.t('fillUp.cost');
  }

  raw(f: Field): string {
    if (f === 'odometer') {
      return this.odometer();
    }
    if (f === 'liters') {
      return this.liters();
    }
    return this.cost();
  }

  setRaw(f: Field, value: string): void {
    if (f === 'odometer') {
      this.odometer.set(value);
      this.odoError.set('');
    } else if (f === 'liters') {
      this.liters.set(value);
      this.litersError.set('');
    } else {
      this.cost.set(value);
      this.costError.set('');
    }
  }

  onKey(key: string): void {
    if (key === 'back') {
      this.backspace();
      return;
    }
    if (key === '.') {
      this.appendDot();
      return;
    }
    this.appendDigit(key);
  }

  appendDigit(d: string): void {
    const f = this.active();
    const cur = this.raw(f);
    if (cur === '0') {
      this.setRaw(f, d);
      return;
    }
    this.setRaw(f, cur + d);
  }

  appendDot(): void {
    const f = this.active();
    const cur = this.raw(f);
    if (cur.includes('.')) {
      return;
    }
    this.setRaw(f, (cur || '0') + '.');
  }

  backspace(): void {
    const f = this.active();
    this.setRaw(f, this.raw(f).slice(0, -1));
  }

  onNative(event: Event): void {
    const value = (event.target as HTMLInputElement).value.replace(/[^\d.]/g, '');
    this.setRaw(this.active(), value);
  }

  @HostListener('window:keydown', ['$event'])
  onHardwareKey(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      this.appendDigit(event.key);
      return;
    }
    if (event.key === '.' || event.key === ',') {
      event.preventDefault();
      this.appendDot();
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.backspace();
    }
  }

  askDelete(): void {
    this.confirmDelete.set(true);
  }

  async doDelete(): Promise<void> {
    const id = this.editId();
    if (!id) {
      return;
    }
    await this.db.deleteFillUp(id);
    this.confirmDelete.set(false);
    await this.router.navigateByUrl('/');
  }

  async save(): Promise<void> {
    this.odoError.set('');
    this.litersError.set('');
    this.costError.set('');
    this.dateError.set('');

    const odo = Number(this.odometer());
    const liters = Number(this.liters());
    const cost = Number(this.cost() || '0');
    const date = this.date();
    const car = this.db.car();
    if (!car) {
      return;
    }

    let ok = true;
    if (!Number.isFinite(odo) || odo <= 0) {
      this.odoError.set(this.i18n.t('fillUp.err.odometer'));
      ok = false;
    } else {
      const others = this.db
        .fillUps()
        .filter((f) => f.id !== this.editId())
        .map((f) => f.odometer);
      const floor = Math.max(car.initialOdometer, ...others, 0);
      // New fill-ups must be >= current known; edits may not go below remaining max floor.
      const minAllowed = this.editId() ? floor : car.currentOdometer;
      if (odo < minAllowed) {
        this.odoError.set(this.i18n.t('fillUp.err.odometerLow'));
        ok = false;
      }
    }
    if (!Number.isFinite(liters) || liters <= 0) {
      this.litersError.set(this.i18n.t('fillUp.err.liters'));
      ok = false;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      this.costError.set(this.i18n.t('fillUp.err.cost'));
      ok = false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this.dateError.set(this.i18n.t('fillUp.err.date'));
      ok = false;
    }
    if (!ok) {
      return;
    }

    this.saving.set(true);
    try {
      const w = this.weather();
      await this.db.saveFillUp({
        id: this.editId() ?? undefined,
        odometer: odo,
        liters,
        cost,
        tankFull: this.tankFull(),
        date,
        lat: w?.lat,
        lon: w?.lon,
        tempC: w?.tempC,
        weatherCode: w?.weatherCode,
      });
      await this.router.navigateByUrl('/');
    } finally {
      this.saving.set(false);
    }
  }
}
