import { Injectable, inject } from '@angular/core';
import { Db } from '../data/db';
import type { CountryFuelPrices } from '../data/remote';
import type { PriceChange } from '../domain/fuel-price-watch';
import type { WatchedGrade } from '../domain/models';
import type { MsgKey } from '../i18n/en';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';

const GRADE_KEYS: Record<WatchedGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
};

/** Records fetched boards; notifies once per detected change, never blocks logging. */
@Injectable({ providedIn: 'root' })
export class PriceWatch {
  private readonly db = inject(Db);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(I18n);

  async record(board: CountryFuelPrices): Promise<void> {
    let changes: PriceChange[];
    try {
      changes = await this.db.recordFuelPrices(board);
    } catch {
      return;
    }
    if (!changes.length) {
      return;
    }
    const settings = this.db.settings();
    if (settings.remindersEnabled !== true || settings.notifyFuelPrices === false) {
      return;
    }
    if (this.notify.permission() !== 'granted') {
      return;
    }
    const currency = board.currency || settings.currency;
    const body = changes
      .map((c) =>
        this.i18n.t('priceWatch.notifyLine', {
          grade: this.i18n.t(GRADE_KEYS[c.grade]),
          to: this.i18n.formatMoney(c.to, currency, 2),
          from: this.i18n.formatMoney(c.from, currency, 2),
        }),
      )
      .join(' · ');
    this.notify.showGeneric(
      this.i18n.t('priceWatch.notifyTitle'),
      body,
      `drivelog-price-${board.countryCode}`,
    );
  }
}