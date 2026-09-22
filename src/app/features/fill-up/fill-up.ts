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
  needsManualUnitPrice,
  priceForGrade,
  resolveUnitPrice,
} from '../../domain/fill-up-cost';
import { countryFromCurrency } from '../../domain/country';
import { todayDateOnly } from '../../domain/dues';
import {
  TANK_FALLBACK,
  computeOdometerFromDistance,
  validateFillDistance,
} from '../../domain/fill-up-distance';
import type { FuelGrade } from '../../domain/models';
import { kWhPer100Km } from '../../domain/charge-economy';
import { distinctPlaceLabels } from '../../domain/place-labels';
import { isRealFillUp } from '../../domain/setup-checklist';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { countryFuelPrices, getCoords, nearbyPoi, type NearbyPoi } from '../../data/remote';
import { takeSharedFillImage } from '../../pwa/share-target';
import {
  bestReceiptPick,
  parseReceiptText,
  receiptMathOk,
  type ReceiptCandidates,
  type ReceiptPick,
} from '../../domain/receipt-ocr';
import { ocrReceiptImage } from '../../domain/receipt-ocr-worker';
import { ConfirmBar } from '../../ui/confirm-bar';
import { DateField } from '../../ui/date-field';
import {
  buildGradeOptions,
  FuelGradeSelector,
} from '../../ui/fuel-grade-selector';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { ReceiptPreview } from '../../ui/receipt-preview';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';
import { TextField } from '../../ui/text-field';

const GRADE_KEYS: Record<FuelGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
  custom: 'fillUp.lastPaid',
};

type LogMode = 'fuel' | 'charge';

@Component({
  selector: 'app-fill-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    SectionTabs,
    NumericField,
    FuelGradeSelector,
    ReceiptPreview,
    DateField,
    TextField,
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
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly sectionTabs: SectionTab[] = [
    { labelKey: 'fillUp.title', link: '/fill-up' },
    { labelKey: 'section.history', link: '/history/fill-ups' },
  ];

  readonly distanceKm = signal('');
  readonly liters = signal('');
  readonly fuelGrade = signal<FuelGrade | null>(null);
  readonly date = signal(todayDateOnly());
  readonly placeLabel = signal('');
  readonly note = signal('');
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
  readonly manualUnitPrice = signal('');
  readonly nextDueBanner = signal(false);
  /** Image from PWA share_target (?shared=1) — feeds OCR in F1. */
  readonly sharedPreviewUrl = signal<string | null>(null);
  readonly sharedBlob = signal<Blob | null>(null);
  readonly logMode = signal<LogMode>('fuel');
  readonly chargeOdo = signal('');
  readonly chargeKWh = signal('');
  readonly chargeCost = signal('');
  readonly chargeDistance = signal('');
  readonly chargeOdoError = signal('');
  readonly chargeKWhError = signal('');
  readonly chargeCostError = signal('');
  readonly editChargeId = signal<string | null>(null);
  readonly ocrBusy = signal(false);
  readonly ocrError = signal('');
  readonly ocrCandidates = signal<ReceiptCandidates | null>(null);
  readonly ocrPick = signal<ReceiptPick>({});
  readonly ocrStage = signal<'idle' | 'review'>('idle');
  readonly softStation = signal<NearbyPoi | null>(null);
  readonly softStationDismissed = signal(false);

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
    if (!grade) {
      return false;
    }
    const board = grade === 'custom' ? null : priceForGrade(this.fuelPrices(), grade);
    if (board != null && board > 0) {
      return false;
    }
    const manual = Number(this.manualUnitPrice());
    if (Number.isFinite(manual) && manual > 0) {
      return false;
    }
    return this.lastUnit() != null;
  });

  readonly canSave = computed(() => {
    if (this.logMode() === 'charge') {
      return this.canSaveCharge();
    }
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

  readonly chargeEconomy = computed(() => {
    const kWh = Number(this.chargeKWh()) || 0;
    const d = Number(this.chargeDistance()) || 0;
    return kWhPer100Km({ kWh, distanceKm: d > 0 ? d : undefined });
  });

  readonly ocrMath = computed(() => receiptMathOk(this.ocrPick()));

  private canSaveCharge(): boolean {
    const odo = Number(this.chargeOdo());
    const kWh = Number(this.chargeKWh());
    const cost = Number(this.chargeCost());
    return (
      Number.isFinite(odo) &&
      odo > 0 &&
      Number.isFinite(kWh) &&
      kWh > 0 &&
      Number.isFinite(cost) &&
      cost >= 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(this.date()) &&
      !this.saving()
    );
  }

  constructor() {
    void this.loadPrices();
    const chargeId = this.route.snapshot.queryParamMap.get('chargeId');
    const id = this.route.snapshot.queryParamMap.get('id');
    if (chargeId) {
      this.logMode.set('charge');
      this.loadCharge(chargeId);
    } else if (id) {
      this.load(id);
    } else {
      const lastGrade = lastFuelGrade(this.db.fillUps());
      if (lastGrade) {
        this.fuelGrade.set(lastGrade);
      }
      const car = this.db.car();
      if (car) {
        this.chargeOdo.set(String(car.currentOdometer));
      }
    }
    if (this.route.snapshot.queryParamMap.get('shared') === '1') {
      void this.loadSharedImage();
    }
    void this.maybeSoftStation();
  }

  /** F4: only if geolocation permission already granted — never prompt on open. */
  private async maybeSoftStation(): Promise<void> {
    if (this.editId() || this.editChargeId() || this.logMode() === 'charge') {
      return;
    }
    try {
      const perms = navigator.permissions;
      if (!perms?.query) {
        return;
      }
      const status = await perms.query({ name: 'geolocation' as PermissionName });
      if (status.state !== 'granted') {
        return;
      }
      const coords = await getCoords();
      if (!coords) {
        return;
      }
      const list = await nearbyPoi(coords, 'fuel');
      const nearest = list.filter((p) => p.kind === 'fuel')[0];
      if (nearest) {
        this.softStation.set(nearest);
        this.nearbyStations.set(list.filter((p) => p.kind === 'fuel').slice(0, 5));
      }
    } catch {
      /* ignore permission / API errors */
    }
  }

  useSoftStation(): void {
    const poi = this.softStation();
    if (!poi) {
      return;
    }
    this.selectStation(poi);
    this.softStationDismissed.set(true);
  }

  dismissSoftStation(): void {
    this.softStationDismissed.set(true);
  }

  setLogMode(mode: LogMode): void {
    this.logMode.set(mode);
  }

  private async loadSharedImage(): Promise<void> {
    const shared = await takeSharedFillImage();
    if (!shared) {
      return;
    }
    this.clearSharedImage();
    this.sharedBlob.set(shared.blob);
    this.sharedPreviewUrl.set(shared.objectUrl);
  }

  clearSharedImage(): void {
    const url = this.sharedPreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.sharedPreviewUrl.set(null);
    this.sharedBlob.set(null);
  }

  async onScanFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.runOcr(file);
  }

  async scanSharedOrPick(): Promise<void> {
    const blob = this.sharedBlob();
    if (blob) {
      await this.runOcr(blob);
      return;
    }
    document.getElementById('receipt-scan-input')?.click();
  }

  private async runOcr(image: Blob): Promise<void> {
    this.ocrBusy.set(true);
    this.ocrError.set('');
    this.ocrStage.set('idle');
    try {
      const text = await ocrReceiptImage(image);
      const candidates = parseReceiptText(text);
      const pick = bestReceiptPick(candidates);
      this.ocrCandidates.set(candidates);
      this.ocrPick.set(pick);
      this.ocrStage.set('review');
      if (!this.sharedPreviewUrl()) {
        this.sharedBlob.set(image);
        this.sharedPreviewUrl.set(URL.createObjectURL(image));
      }
    } catch {
      this.ocrError.set(this.i18n.t('fillUp.scanFailed'));
    } finally {
      this.ocrBusy.set(false);
    }
  }

  setOcrLiters(v: string): void {
    const n = Number(v);
    this.ocrPick.update((p) => ({
      ...p,
      liters: Number.isFinite(n) && n > 0 ? n : undefined,
    }));
  }

  setOcrPrice(v: string): void {
    const n = Number(v);
    this.ocrPick.update((p) => ({
      ...p,
      unitPrice: Number.isFinite(n) && n > 0 ? n : undefined,
    }));
  }

  setOcrTotal(v: string): void {
    const n = Number(v);
    this.ocrPick.update((p) => ({
      ...p,
      total: Number.isFinite(n) && n > 0 ? n : undefined,
    }));
  }

  /** Apply OCR pick into the form — never auto-saves. */
  applyOcrPick(): void {
    const pick = this.ocrPick();
    if (pick.liters != null) {
      this.liters.set(String(pick.liters));
      this.onLitersChange();
    }
    if (pick.unitPrice != null) {
      this.manualUnitPrice.set(String(pick.unitPrice));
      if (!this.fuelGrade()) {
        this.fuelGrade.set('custom');
      }
    }
    this.ocrStage.set('idle');
  }

  discardOcr(): void {
    this.ocrStage.set('idle');
    this.ocrCandidates.set(null);
    this.ocrPick.set({});
    this.ocrError.set('');
  }

  loadCharge(id: string): void {
    const row = this.db.chargeSessions().find((c) => c.id === id);
    if (!row) {
      return;
    }
    this.editChargeId.set(id);
    this.chargeOdo.set(String(row.odometer));
    this.chargeKWh.set(String(row.kWh));
    this.chargeCost.set(String(row.cost));
    this.chargeDistance.set(row.distanceKm != null ? String(row.distanceKm) : '');
    this.date.set(row.date);
    this.placeLabel.set(row.placeLabel ?? '');
    this.note.set(row.note ?? '');
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
      this.seedManualPrice();
    } finally {
      this.pricesBusy.set(false);
      this.pricesReady.set(true);
    }
  }

  /** Prefill typed price from last fill when board prices are missing. */
  private seedManualPrice(): void {
    if (this.manualUnitPrice()) {
      return;
    }
    const last = this.lastUnit();
    if (last != null && last > 0) {
      this.manualUnitPrice.set(String(last));
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
    if (existing.unitPrice != null && existing.unitPrice > 0) {
      this.manualUnitPrice.set(String(existing.unitPrice));
    }
    this.date.set(existing.date);
    this.placeLabel.set(existing.placeLabel ?? '');
    this.note.set(existing.note ?? '');
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
    if (this.logMode() === 'charge') {
      const cid = this.editChargeId();
      if (!cid) {
        return;
      }
      await this.db.deleteChargeSession(cid);
      this.confirmDelete.set(false);
      await this.router.navigateByUrl('/history/fill-ups');
      return;
    }
    const id = this.editId();
    if (!id) {
      return;
    }
    await this.db.deleteFillUp(id);
    this.confirmDelete.set(false);
    await this.router.navigateByUrl('/');
  }

  async save(): Promise<void> {
    if (this.logMode() === 'charge') {
      await this.saveCharge();
      return;
    }
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
    const wasFirstReal =
      !this.editId() && !this.db.fillUps().some(isRealFillUp);
    const sampleMode = this.db.settings().sampleMode === true;

    this.saving.set(true);
    try {
      await this.db.saveFillUp({
        id: this.editId() ?? undefined,
        odometer,
        liters,
        cost,
        unitPrice: unit,
        fuelGrade: grade,
        tankFull: existing?.tankFull ?? false,
        distanceKm: persistDistance ? distance : undefined,
        date,
        placeLabel: station,
        note: this.note().trim() || undefined,
        lat: selected?.lat,
        lon: selected?.lon,
      });
      if (wasFirstReal && !sampleMode) {
        if (!this.db.settings().firstRealFillAt) {
          await this.db.updateSettings({
            firstRealFillAt: new Date().toISOString(),
          });
        }
        this.resetFormAfterFirstSave();
        this.nextDueBanner.set(true);
      } else {
        await this.router.navigateByUrl('/fuel');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async saveCharge(): Promise<void> {
    this.chargeOdoError.set('');
    this.chargeKWhError.set('');
    this.chargeCostError.set('');
    this.dateError.set('');
    const odo = Number(this.chargeOdo());
    const kWh = Number(this.chargeKWh());
    const cost = Number(this.chargeCost());
    const dist = Number(this.chargeDistance());
    const date = this.date();
    let ok = true;
    if (!Number.isFinite(odo) || odo <= 0) {
      this.chargeOdoError.set(this.i18n.t('charge.err.odometer'));
      ok = false;
    }
    if (!Number.isFinite(kWh) || kWh <= 0) {
      this.chargeKWhError.set(this.i18n.t('charge.err.kWh'));
      ok = false;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      this.chargeCostError.set(this.i18n.t('charge.err.cost'));
      ok = false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this.dateError.set(this.i18n.t('fillUp.err.date'));
      ok = false;
    }
    if (!ok || !this.db.car()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.db.saveChargeSession({
        id: this.editChargeId() ?? undefined,
        odometer: odo,
        kWh,
        cost,
        date,
        distanceKm: Number.isFinite(dist) && dist > 0 ? dist : undefined,
        placeLabel: this.placeLabel().trim() || undefined,
        note: this.note().trim() || undefined,
      });
      await this.router.navigateByUrl('/history/fill-ups');
    } finally {
      this.saving.set(false);
    }
  }
    } finally {
      this.saving.set(false);
    }
  }

  dismissNextDueBanner(): void {
    this.nextDueBanner.set(false);
  }

  private resetFormAfterFirstSave(): void {
    this.distanceKm.set('');
    this.liters.set('');
    this.date.set(todayDateOnly());
    this.placeLabel.set('');
    this.note.set('');
    this.dateError.set('');
    this.distanceError.set('');
    this.distanceWarn.set('');
    this.litersError.set('');
    this.capacityWarn.set('');
    this.locationError.set('');
    this.nearbyStations.set([]);
    this.selectedStationId.set(null);
    this.distanceTouched.set(false);
    this.legacyDistanceEdit.set(false);
    this.editId.set(null);
    const lastGrade = lastFuelGrade(this.db.fillUps());
    if (lastGrade) {
      this.fuelGrade.set(lastGrade);
    } else if (this.gradeOptions().length) {
      this.fuelGrade.set(this.gradeOptions()[0]!.grade);
    } else if (this.lastUnit()) {
      this.fuelGrade.set('custom');
    } else {
      this.fuelGrade.set(null);
    }
    const last = this.lastUnit();
    this.manualUnitPrice.set(last != null && last > 0 ? String(last) : '');
  }
}
