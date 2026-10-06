import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../../../data/db';
import { countryFuelPrices } from '../../../../data/remote';
import { countryFromCurrency } from '../../../../domain/country';
import { todayDateOnly } from '../../../../domain/dues';
import {
  computeFillUpCost,
  lastFillUnitPriceFromHistory,
  lastFuelGrade,
  needsManualUnitPrice,
  resolveUnitPrice,
} from '../../../../domain/fill-up-cost';
import {
  computeOdometerFromDistance,
  validateFillDistance,
} from '../../../../domain/fill-up-distance';
import type { FuelGrade } from '../../../../domain/models';
import { I18n } from '../../../../i18n/i18n';
import type { MsgKey } from '../../../../i18n/en';
import { buildGradeOptions } from '../../../../ui/fuel-grade-selector';
import { NumericField } from '../../../../ui/numeric-field';
import { PrimaryButton } from '../../../../ui/primary-button';

const GRADE_KEYS: Record<FuelGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
  custom: 'fillUp.lastPaid',
};

@Component({
  selector: 'app-quick-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumericField, PrimaryButton, RouterLink],
  templateUrl: './quick-log.html',
  styleUrl: './quick-log.scss',
})
export class QuickLog {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly saved = output<void>();

  readonly distanceKm = signal('');
  readonly liters = signal('');
  readonly fuelGrade = signal<FuelGrade | null>(lastFuelGrade(this.db.fillUps()));
  readonly saving = signal(false);
  readonly error = signal('');
  readonly fuelPrices = signal<Awaited<ReturnType<typeof countryFuelPrices>>>(null);
  readonly pricesReady = signal(false);
  readonly manualUnitPrice = signal('');

  readonly lastUnit = computed(() => lastFillUnitPriceFromHistory(this.db.fillUps()));
  readonly gradeOptions = computed(() => buildGradeOptions(this.fuelPrices(), GRADE_KEYS));
  readonly needsManualPrice = computed(() =>
    needsManualUnitPrice(this.fuelGrade(), this.fuelPrices()),
  );
  readonly pricesUnavailable = computed(
    () => this.pricesReady() && this.fuelPrices() == null,
  );
  readonly unitPrice = computed(() => {
    const manual = Number(this.manualUnitPrice());
    return resolveUnitPrice(
      this.fuelGrade(),
      this.fuelPrices(),
      this.lastUnit(),
      Number.isFinite(manual) && manual > 0 ? manual : null,
    );
  });
  readonly litersNum = computed(() => Number(this.liters()) || 0);
  readonly distanceNum = computed(() => Number(this.distanceKm()) || 0);
  readonly cost = computed(() => {
    const unit = this.unitPrice();
    return unit == null ? 0 : computeFillUpCost(this.litersNum(), unit);
  });
  readonly canSave = computed(
    () =>
      this.distanceNum() > 0 &&
      this.litersNum() > 0 &&
      this.unitPrice() != null &&
      this.fuelGrade() != null &&
      !this.saving(),
  );

  constructor() {
    void this.loadPrices();
  }

  async loadPrices(): Promise<void> {
    try {
      const cc = countryFromCurrency(this.db.settings().currency);
      this.fuelPrices.set(await countryFuelPrices(cc));
      if (!this.fuelGrade() && this.gradeOptions().length) {
        this.fuelGrade.set(this.gradeOptions()[0]!.grade);
      }
      if (!this.manualUnitPrice()) {
        const last = this.lastUnit();
        if (last != null && last > 0) {
          this.manualUnitPrice.set(String(last));
        }
      }
    } finally {
      this.pricesReady.set(true);
    }
  }

  async save(): Promise<void> {
    this.error.set('');
    const car = this.db.car();
    const grade = this.fuelGrade();
    const unit = this.unitPrice();
    if (!car || !grade || unit == null) return;

    const distCheck = validateFillDistance(car, this.db.fillUps(), this.distanceNum());
    if (!distCheck.ok && distCheck.errorKey) {
      this.error.set(this.i18n.t(distCheck.errorKey));
      return;
    }

    const odometer = computeOdometerFromDistance(
      car,
      this.db.fillUps(),
      this.distanceNum(),
    );
    this.saving.set(true);
    try {
      await this.db.saveFillUp({
        odometer,
        liters: this.litersNum(),
        cost: this.cost(),
        unitPrice: unit,
        fuelGrade: grade,
        tankFull: false,
        distanceKm: this.distanceNum(),
        date: todayDateOnly(),
      });
      this.distanceKm.set('');
      this.liters.set('');
      this.saved.emit();
    } catch {
      this.error.set(this.i18n.t('home.quickAdd.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
