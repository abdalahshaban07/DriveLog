import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  computeFillUpCost,
  lastFillUnitPriceFromHistory,
  lastFuelGrade,
  pickUnitPrice,
  priceForGrade,
} from '../../domain/fill-up-cost';
import { countryFromCurrency } from '../../domain/country';
import { todayDateOnly } from '../../domain/dues';
import {
  TANK_FALLBACK,
  computeOdometerFromDistance,
  validateFillDistance,
} from '../../domain/fill-up-distance';
import type { FuelGrade } from '../../domain/models';
import { distinctPlaceLabels } from '../../domain/place-labels';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { countryFuelPrices, getCoords, nearbyPoi, type NearbyPoi } from '../../data/remote';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import {
  buildGradeOptions,
  FuelGradeSelector,
} from '../../ui/fuel-grade-selector';
import { FuelTank3d } from '../../ui/fuel-tank-3d/fuel-tank-3d';
import { FuelTankCanvas } from '../../ui/fuel-tank-canvas/fuel-tank-canvas';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { ReceiptPreview } from '../../ui/receipt-preview';

const GRADE_KEYS: Record<FuelGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
  custom: 'fillUp.lastPaid',
};

@Component({
  selector: 'app-fill-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    NumericField,
    FuelGradeSelector,
    FuelTank3d,
    FuelTankCanvas,
    ReceiptPreview,
    DateField,
    PrimaryButton,
    ConfirmBar,
    RouterLink,
  ],
  templateUrl: './fill-up.html',
  styleUrl: './fill-up.scss',
})
export class FillUpPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly distanceKm = signal('');
  readonly liters = signal('');
  readonly fuelGrade = signal<FuelGrade | null>(null);
  readonly date = signal(todayDateOnly());
  readonly placeLabel = signal('');
  readonly dateError = signal('');
  readonly distanceError = signal('');
  readonly distanceWarn = signal('');
  readonly litersError = signal('');
  readonly capacityWarn = signal('');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly confirmDelete = signal(false);
  readonly locationBusy = signal(false);
  readonly locationError = signal('');
  readonly nearbyStations = signal<NearbyPoi[]>([]);
  readonly selectedStationId = signal<number | null>(null);
  readonly pricesBusy = signal(false);
  readonly pricesReady = signal(false);
  readonly legacyDistanceEdit = signal(false);
  readonly distanceTouched = signal(false);
  readonly fuelPrices = signal<Awaited<ReturnType<typeof countryFuelPrices>>>(null);

  readonly lastUnit = computed(() => lastFillUnitPriceFromHistory(this.db.fillUps()));

  readonly stationSuggestions = computed(() => distinctPlaceLabels(this.db.fillUps()));

  readonly fuelNearby = computed(() =>
    this.nearbyStations()
      .filter((p) => p.kind === 'fuel')
      .slice(0, 5),
  );

  readonly isFirstFill = computed(
    () =>
      !this.db
        .fillUps()
        .some((f) => f.id !== this.editId() && (!f.carId || f.carId === this.db.car()?.id)),
  );

  readonly distanceLabel = computed(() =>
    this.isFirstFill()
      ? this.i18n.t('fillUp.distanceSinceSetup')
      : this.i18n.t('fillUp.distanceKm'),
  );

  readonly tankCapacity = computed(
    () => this.db.car()?.tankCapacityLiters ?? TANK_FALLBACK,
  );

  readonly showTankHint = computed(() => this.db.car()?.tankCapacityLiters == null);

  readonly gradeOptions = computed(() =>
    buildGradeOptions(this.fuelPrices(), GRADE_KEYS),
  );

  readonly unitPrice = computed(() =>
    pickUnitPrice(this.fuelGrade(), this.fuelPrices(), this.lastUnit()),
  );

  readonly litersNum = computed(() => Number(this.liters()) || 0);
  readonly distanceNum = computed(() => Number(this.distanceKm()) || 0);

  readonly liveEconomy = computed(() => {
    const d = this.distanceNum();
    const l = this.litersNum();
    if (d <= 0 || l <= 0) {
      return null;
    }
    return (l / d) * 100;
  });

  readonly computedCost = computed(() => {
    const liters = this.litersNum();
    const unit = this.unitPrice();
    if (!Number.isFinite(liters) || unit == null) {
      return 0;
    }
    return computeFillUpCost(liters, unit);
  });

  readonly usingLastPaid = computed(() => {
    const grade = this.fuelGrade();
    if (!grade || grade === 'custom') {
      return grade === 'custom';
    }
    const board = priceForGrade(this.fuelPrices(), grade);
    return board == null && this.lastUnit() != null;
  });

  readonly canSave = computed(() => {
    const distance = this.distanceNum();
    const liters = this.litersNum();
    return (
      Number.isFinite(distance) &&
      distance > 0 &&
      Number.isFinite(liters) &&
      liters > 0 &&
      this.unitPrice() != null &&
      this.fuelGrade() != null &&
      /^\d{4}-\d{2}-\d{2}$/.test(this.date()) &&
      !this.saving()
    );
  });

  constructor() {
    void this.loadPrices();
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.load(id);
    } else {
      const lastGrade = lastFuelGrade(this.db.fillUps());
      if (lastGrade) {
        this.fuelGrade.set(lastGrade);
      }
    }
  }

  async loadPrices(): Promise<void> {
    this.pricesBusy.set(true);
    this.pricesReady.set(false);
    try {
      const cc = countryFromCurrency(this.db.settings().currency);
      this.fuelPrices.set(await countryFuelPrices(cc));
      if (!this.fuelGrade() && this.gradeOptions().length) {
        this.fuelGrade.set(this.gradeOptions()[0]!.grade);
      } else if (!this.fuelGrade() && this.lastUnit()) {
        this.fuelGrade.set('custom');
      }
    } finally {
      this.pricesBusy.set(false);
      this.pricesReady.set(true);
    }
  }

  load(id: string): void {
    const existing = this.db.fillUps().find((f) => f.id === id);
    const car = this.db.car();
    if (!existing || !car) {
      return;
    }
    this.editId.set(id);
    if (existing.distanceKm != null) {
      this.distanceKm.set(String(existing.distanceKm));
      this.legacyDistanceEdit.set(false);
    } else {
      const prev = this.db
        .fillUps()
        .filter((f) => f.id !== id && (!f.carId || f.carId === car.id))
        .sort((a, b) => b.odometer - a.odometer)[0];
      const base = prev?.odometer ?? car.initialOdometer;
      this.distanceKm.set(String(Math.max(0, existing.odometer - base)));
      this.legacyDistanceEdit.set(false);
    }
    this.liters.set(String(existing.liters));
    this.fuelGrade.set(existing.fuelGrade ?? 'custom');
    this.date.set(existing.date);
    this.placeLabel.set(existing.placeLabel ?? '');
    this.distanceError.set('');
    this.litersError.set('');
    this.dateError.set('');
    this.locationError.set('');
    this.distanceWarn.set('');
    this.capacityWarn.set('');
  }

  onDistanceChange(): void {
    this.distanceTouched.set(true);
    this.distanceError.set('');
    this.distanceWarn.set('');
    const car = this.db.car();
    if (!car) {
      return;
    }
    const d = this.distanceNum();
    if (!d) {
      return;
    }
    const result = validateFillDistance(car, this.db.fillUps(), d, this.editId() ?? undefined);
    if (!result.ok && result.errorKey) {
      this.distanceError.set(this.i18n.t(result.errorKey));
    } else if (result.warnKey) {
      this.distanceWarn.set(this.i18n.t(result.warnKey));
    }
    this.checkCapacity();
  }

  onLitersChange(): void {
    this.litersError.set('');
    this.checkCapacity();
  }

  onPlaceLabelInput(event: Event): void {
    this.placeLabel.set((event.target as HTMLInputElement).value);
    this.selectedStationId.set(null);
  }

  selectStation(poi: NearbyPoi): void {
    this.selectedStationId.set(poi.id);
    this.placeLabel.set(poi.name);
  }

  async useLocation(): Promise<void> {
    this.locationError.set('');
    this.locationBusy.set(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        this.locationError.set(this.i18n.t('fillUp.locationDenied'));
        this.nearbyStations.set([]);
        this.selectedStationId.set(null);
        return;
      }
      const list = await nearbyPoi(coords, 'fuel');
      const fuel = list.filter((p) => p.kind === 'fuel').slice(0, 5);
      if (!fuel.length) {
        this.locationError.set(this.i18n.t('fillUp.noStations'));
        this.nearbyStations.set([]);
        this.selectedStationId.set(null);
        return;
      }
      this.nearbyStations.set(fuel);
      this.selectedStationId.set(fuel[0]!.id);
      this.placeLabel.set(fuel[0]!.name);
    } finally {
      this.locationBusy.set(false);
    }
  }

  private checkCapacity(): void {
    const cap = this.db.car()?.tankCapacityLiters;
    const l = this.litersNum();
    if (cap != null && l > cap) {
      this.capacityWarn.set(this.i18n.t('fillUp.warn.overCapacity'));
    } else {
      this.capacityWarn.set('');
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
    this.distanceError.set('');
    this.distanceWarn.set('');
    this.litersError.set('');
    this.dateError.set('');

    const distance = this.distanceNum();
    const liters = this.litersNum();
    const unit = this.unitPrice();
    const grade = this.fuelGrade();
    const date = this.date();
    const car = this.db.car();
    if (!car || unit == null || !grade) {
      return;
    }
    const cost = computeFillUpCost(liters, unit);

    let ok = true;
    const distCheck = validateFillDistance(
      car,
      this.db.fillUps(),
      distance,
      this.editId() ?? undefined,
    );
    if (!distCheck.ok && distCheck.errorKey) {
      this.distanceError.set(this.i18n.t(distCheck.errorKey));
      ok = false;
    } else if (distCheck.warnKey) {
      this.distanceWarn.set(this.i18n.t(distCheck.warnKey));
    }

    if (!Number.isFinite(liters) || liters <= 0) {
      this.litersError.set(this.i18n.t('fillUp.err.liters'));
      ok = false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this.dateError.set(this.i18n.t('fillUp.err.date'));
      ok = false;
    }
    if (!ok) {
      return;
    }

    const odometer = computeOdometerFromDistance(
      car,
      this.db.fillUps(),
      distance,
      this.editId() ?? undefined,
    );

    const existing = this.editId()
      ? this.db.fillUps().find((f) => f.id === this.editId())
      : undefined;
    const persistDistance =
      !existing || existing.distanceKm != null || this.distanceTouched();

    const station = this.placeLabel().trim() || undefined;
    const selected = this.fuelNearby().find((p) => p.id === this.selectedStationId());

    this.saving.set(true);
    try {
      await this.db.saveFillUp({
        id: this.editId() ?? undefined,
        odometer,
        liters,
        cost,
        unitPrice: unit,
        fuelGrade: grade,
        tankFull: false,
        distanceKm: persistDistance ? distance : undefined,
        date,
        placeLabel: station,
        lat: selected?.lat,
        lon: selected?.lon,
      });
      await this.router.navigateByUrl('/fuel');
    } finally {
      this.saving.set(false);
    }
  }
}
