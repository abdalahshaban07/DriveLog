import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  countryFuelPrices,
  getCoords,
  lastFillUnitPrice,
  mapsSearchUrl,
  nearbyPoi,
  type CountryFuelPrices,
  type NearbyPoi,
} from '../../data/remote';
import { countryFromCurrency } from '../../domain/country';
import { latestEconomy, monthFuelSpend, overallLitersPer100Km } from '../../domain/economy';
import { buildDueItems, nextDueItem } from '../../domain/dues';
import { suggestMaintenanceDues } from '../../domain/interval';
import type { DueItem } from '../../domain/models';
import { weatherMsgKey } from '../../domain/weather';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { InstallPwa } from '../../pwa/install-pwa';
import { DueRow } from '../../ui/due-row';

type NearbyTab = 'fuel' | 'charge';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DueRow, DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly install = inject(InstallPwa);

  readonly carName = computed(() => this.db.car()?.nickname || this.i18n.t('app.name'));
  readonly economy = computed(() => latestEconomy(this.db.fillUps()));
  readonly overallL100 = computed(() => overallLitersPer100Km(this.db.fillUps()));
  readonly monthSpend = computed(() => monthFuelSpend(this.db.fillUps()));
  readonly lastUnit = computed(() => {
    const fills = [...this.db.fillUps()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    const last = fills[0];
    if (!last) {
      return null;
    }
    return lastFillUnitPrice(last.liters, last.cost);
  });
  readonly lastWeather = computed(() => {
    const withWx = [...this.db.fillUps()]
      .filter((f) => f.tempC != null && f.weatherCode != null)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return withWx[0] ?? null;
  });
  readonly vehicleLine = computed(() => {
    const c = this.db.car();
    if (!c) {
      return '';
    }
    return [c.year, c.make, c.model].filter(Boolean).join(' ');
  });
  readonly due = computed(() => {
    const car = this.db.car();
    if (!car) {
      return null;
    }
    return nextDueItem(
      buildDueItems(this.db.settings(), this.db.maintenance(), car.currentOdometer),
    );
  });
  readonly suggested = computed(() => {
    const car = this.db.car();
    if (!car) {
      return null;
    }
    return suggestMaintenanceDues(this.db.maintenance(), car.currentOdometer)[0] ?? null;
  });
  readonly showInstall = computed(
    () => !this.install.installed() && !this.db.settings().installBannerDismissed,
  );

  readonly fuelPrices = signal<CountryFuelPrices | null>(null);
  readonly pricesBusy = signal(false);
  readonly pricesError = signal('');
  readonly nearbyTab = signal<NearbyTab>('fuel');
  readonly nearbyBusy = signal(false);
  readonly nearbyError = signal('');
  readonly nearbyAll = signal<NearbyPoi[]>([]);
  readonly nearbyList = computed(() => this.nearbyAll().filter((p) => p.kind === this.nearbyTab()));

  constructor() {
    void this.loadPrices();
  }

  async loadPrices(): Promise<void> {
    this.pricesBusy.set(true);
    this.pricesError.set('');
    try {
      const cc = countryFromCurrency(this.db.settings().currency);
      const prices = await countryFuelPrices(cc);
      this.fuelPrices.set(prices);
      if (!prices) {
        this.pricesError.set('');
      }
    } catch {
      this.fuelPrices.set(null);
      this.pricesError.set(this.i18n.t('home.fuelError'));
    } finally {
      this.pricesBusy.set(false);
    }
  }

  async findNearby(): Promise<void> {
    this.nearbyError.set('');
    this.nearbyBusy.set(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        this.nearbyError.set(this.i18n.t('home.nearbyGpsDenied'));
        this.nearbyAll.set([]);
        return;
      }
      const list = await nearbyPoi(coords, this.nearbyTab());
      this.nearbyAll.set(list);
      if (!list.length) {
        this.nearbyError.set(this.i18n.t('home.nearbyEmpty'));
      }
    } catch {
      this.nearbyError.set(this.i18n.t('home.nearbyUnavailable'));
    } finally {
      this.nearbyBusy.set(false);
    }
  }

  mapsUrl(p: NearbyPoi): string {
    return mapsSearchUrl(p.lat, p.lon, this.i18n.language());
  }

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${this.db.settings().currency}`;
    }
  }

  formatPerLiter(value: number): string {
    try {
      return `${new Intl.NumberFormat(this.i18n.language(), {
        maximumFractionDigits: 2,
      }).format(value)} ${this.db.settings().currency}/L`;
    } catch {
      return `${value.toFixed(2)} ${this.db.settings().currency}/L`;
    }
  }

  weatherLabel(code: number): string {
    return this.i18n.t(weatherMsgKey(code) as MsgKey);
  }

  dueTitle(d: DueItem): string {
    const name = d.labelParams?.['name'];
    if (typeof name === 'string' && name) {
      return name;
    }
    return this.i18n.t(d.labelKey as MsgKey);
  }

  suggestedTitle(): string {
    const s = this.suggested();
    if (!s) {
      return '';
    }
    if (s.otherLabel) {
      return s.otherLabel;
    }
    return this.i18n.t(`maintenance.type.${s.type}` as MsgKey);
  }

  dueMeta(d: { dueDate?: string; dueKm?: number }): string {
    const parts: string[] = [];
    if (d.dueDate) {
      parts.push(d.dueDate);
    }
    if (d.dueKm != null) {
      parts.push(`${d.dueKm} ${this.i18n.t('common.km')}`);
    }
    return parts.join(' · ');
  }

  async doInstall(): Promise<void> {
    await this.install.promptInstall();
  }

  async dismissInstall(): Promise<void> {
    await this.db.updateSettings({ installBannerDismissed: true });
  }
}
