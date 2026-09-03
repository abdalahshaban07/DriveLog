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
  pickUnitPrice,
} from '../../../../domain/fill-up-cost';
import {
  TANK_FALLBACK,
  computeOdometerFromDistance,
  validateFillDistance,
} from '../../../../domain/fill-up-distance';
import type { FuelGrade } from '../../../../domain/models';
import { distinctPlaceLabels } from '../../../../domain/place-labels';
import { I18n } from '../../../../i18n/i18n';
import type { MsgKey } from '../../../../i18n/en';
import {
  buildGradeOptions,
  FuelGradeSelector,
} from '../../../../ui/fuel-grade-selector';
import { FuelTankCanvas } from '../../../../ui/fuel-tank-canvas/fuel-tank-canvas';
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
  imports: [NumericField, FuelGradeSelector, FuelTankCanvas, PrimaryButton, RouterLink],
  templateUrl: './quick-log.html',
  styleUrl: './quick-log.scss',
})
export class QuickLog {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly saved = output<void>();

  readonly distanceKm = signal('');
  readonly liters = signal('');
  readonly station = signal('');
  readonly fuelGrade = signal<FuelGrade | null>(lastFuelGrade(this.db.fillUps()));
  readonly saving = signal(false);
  readonly error = signal('');
  readonly fuelPrices = signal<Awaited<ReturnType<typeof countryFuelPrices>>>(null);

  readonly stationListId = `quick-station-${crypto.randomUUID().slice(0, 8)}`;
  readonly stationSuggestions = computed(() => distinctPlaceLabels(this.db.fillUps()));
  readonly lastUnit = computed(() => lastFillUnitPriceFromHistory(this.db.fillUps()));
  readonly gradeOptions = computed(() => buildGradeOptions(this.fuelPrices(), GRADE_KEYS));
  readonly unitPrice = computed(() =>
    pickUnitPrice(this.fuelGrade(), this.fuelPrices(), this.lastUnit()),
  );
  readonly litersNum = computed(() => Number(this.liters()) || 0);
  readonly distanceNum = computed(() => Number(this.distanceKm()) || 0);
  readonly cost = computed(() => {
    const unit = this.unitPrice();
    return unit == null ? 0 : computeFillUpCost(this.litersNum(), unit);
  });
  readonly tankCapacity = computed(
    () => this.db.car()?.tankCapacityLiters ?? TANK_FALLBACK,
  );
  readonly showTank = computed(() => this.db.car()?.tankCapacityLiters != null);
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
    const cc = countryFromCurrency(this.db.settings().currency);
    this.fuelPrices.set(await countryFuelPrices(cc));
    if (!this.fuelGrade() && this.gradeOptions().length) {
      this.fuelGrade.set(this.gradeOptions()[0]!.grade);
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
        placeLabel: this.station().trim() || undefined,
      });
      this.distanceKm.set('');
      this.liters.set('');
      this.station.set('');
      this.saved.emit();
    } catch {
      this.error.set(this.i18n.t('home.quickAdd.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
