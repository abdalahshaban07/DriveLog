import { Injectable, computed, signal } from '@angular/core';
import {
  BACKUP_VERSION,
  DB_NAME,
  DB_VERSION,
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE,
  DEFAULT_SOON_THRESHOLD,
  DEFAULT_THEME,
  DEFAULT_UNIT_SYSTEM,
  SCHEMA_STORES,
} from '../core/config';
import { knownOdometer } from '../domain/economy';
import { roundOdometerKm } from '../domain/odometer';
import {
  activePeriod,
  newOpenPeriod,
  startNewPeriod as rollExpensePeriod,
} from '../domain/expense-period';
import {
  addCustomMaintenanceType,
  maintenanceDetailFields,
  normalizeCustomTypes,
  type AddCustomTypeResult,
} from '../domain/maintenance-fields';
import { migrateHealthV5 } from '../domain/health-migration';
import { migrateCarExpiryToVault } from '../domain/vehicle-docs';
import {
  mergePartCatalog,
  ROUTINE_CHECK_PART_ID,
  systemPartById,
} from '../domain/part-catalog';
import {
  BREAKDOWN_CATEGORIES,
  DEFAULT_LOOK,
  LOOKS,
  MAINTENANCE_RECORD_TYPES,
  MAINTENANCE_TYPES,
  PART_CATEGORIES,
  PART_CONDITIONS,
  PRE_TRIP_ITEM_IDS,
  THEMES,
  type BackupFile,
  type Breakdown,
  type Car,
  type ChargeSession,
  type ExpensePeriod,
  type FillUp,
  type HealthNotificationState,
  type Look,
  type Maintenance,
  type MaintenanceMilestone,
  type MaintenanceRecordType,
  type MaintenanceTask,
  type MilestoneTaskKind,
  type OtherExpense,
  type PartDefinition,
  type PartOverride,
  type PartTrackingMode,
  type PreTripCheck,
  type PreTripItemId,
  type Settings,
  type Theme,
  type VehicleDocKind,
  type VehicleDocument,
} from '../domain/models';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultSettings(): Settings {
  return {
    language: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    look: DEFAULT_LOOK,
    currency: DEFAULT_CURRENCY,
    unitSystem: DEFAULT_UNIT_SYSTEM,
    installBannerDismissed: false,
    remindersEnabled: false,
    assistantEnabled: true,
    customMaintenanceTypes: [],
    soonThresholdRatio: DEFAULT_SOON_THRESHOLD,
    notifyMaintenance: true,
    notifyBudget: true,
    notifyForecast: true,
  };
}

type DbSnapshot = {
  cars: Car[];
  car: Car | null;
  settings: Settings;
  fillUps: FillUp[];
  maintenance: Maintenance[];
  expensePeriods: ExpensePeriod[];
  breakdowns: Breakdown[];
  otherExpenses: OtherExpense[];
  milestones: MaintenanceMilestone[];
  parts: PartDefinition[];
  partOverrides: PartOverride[];
  healthNotificationState: HealthNotificationState[];
  vehicleDocuments: VehicleDocument[];
  preTripChecks: PreTripCheck[];
  chargeSessions: ChargeSession[];
};

@Injectable({ providedIn: 'root' })
export class Db {
  private readonly _ready = signal(false);
  private readonly _cars = signal<Car[]>([]);
  private readonly _car = signal<Car | null>(null);
  private readonly _settings = signal<Settings>(defaultSettings());
  private readonly _fillUpsAll = signal<FillUp[]>([]);
  private readonly _maintenanceAll = signal<Maintenance[]>([]);
  private readonly _expensePeriodsAll = signal<ExpensePeriod[]>([]);
  private readonly _breakdownsAll = signal<Breakdown[]>([]);
  private readonly _otherExpensesAll = signal<OtherExpense[]>([]);
  private readonly _milestonesAll = signal<MaintenanceMilestone[]>([]);
  private readonly _partsAll = signal<PartDefinition[]>([]);
  private readonly _partOverridesAll = signal<PartOverride[]>([]);
  private readonly _healthNotificationStateAll = signal<HealthNotificationState[]>([]);
  private readonly _vehicleDocumentsAll = signal<VehicleDocument[]>([]);
  private readonly _preTripChecksAll = signal<PreTripCheck[]>([]);
  private readonly _chargeSessionsAll = signal<ChargeSession[]>([]);
  private readonly _error = signal<string | null>(null);
  private readonly _savedFlash = signal(false);

  readonly ready = this._ready.asReadonly();
  readonly cars = this._cars.asReadonly();
  readonly car = this._car.asReadonly();
  readonly settings = this._settings.asReadonly();
  readonly fillUps = computed(() =>
    this.filterForActiveCar(this._fillUpsAll(), this._car()?.id),
  );
  readonly maintenance = computed(() =>
    this.filterForActiveCar(this._maintenanceAll(), this._car()?.id),
  );
  readonly expensePeriods = computed(() =>
    this.filterForActiveCar(this._expensePeriodsAll(), this._car()?.id),
  );
  readonly breakdowns = computed(() =>
    this.filterForActiveCar(this._breakdownsAll(), this._car()?.id),
  );
  readonly otherExpenses = computed(() =>
    this.filterForActiveCar(this._otherExpensesAll(), this._car()?.id),
  );
  readonly milestones = computed(() =>
    this.filterForActiveCar(this._milestonesAll(), this._car()?.id),
  );
  readonly parts = computed(() => {
    const carId = this._car()?.id;
    return this._partsAll().filter((p) => !p.carId || p.carId === carId);
  });
  readonly partOverrides = computed(() =>
    this.filterForActiveCar(this._partOverridesAll(), this._car()?.id),
  );
  readonly healthNotificationState = computed(() =>
    this.filterForActiveCar(this._healthNotificationStateAll(), this._car()?.id),
  );
  readonly vehicleDocuments = computed(() =>
    this.filterForActiveCar(this._vehicleDocumentsAll(), this._car()?.id),
  );
  readonly preTripChecks = computed(() =>
    this.filterForActiveCar(this._preTripChecksAll(), this._car()?.id),
  );
  readonly chargeSessions = computed(() =>
    this.filterForActiveCar(this._chargeSessionsAll(), this._car()?.id),
  );
  readonly catalog = computed(() => mergePartCatalog(this._partsAll()));
  readonly error = this._error.asReadonly();
  readonly savedFlash = this._savedFlash.asReadonly();

  readonly hasCar = computed(() => this._car() !== null);

  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<void> {
    try {
      const db = await this.open();
      const [
        carsRaw,
        settingsRaw,
        fillUps,
        maintenance,
        expensePeriods,
        breakdowns,
        otherExpenses,
        milestones,
        partsRaw,
        overridesRaw,
        notifyRaw,
        vehicleDocsRaw,
        preTripRaw,
        chargeRaw,
      ] = await Promise.all([
        this.getAll<Car>(db, 'car'),
        this.getAll<Settings & { id?: string }>(db, 'settings').then(
          (rows) => rows[0] ?? defaultSettings(),
        ),
        this.getAll<FillUp>(db, 'fillUps'),
        this.getAll<Maintenance>(db, 'maintenance'),
        this.getAll<ExpensePeriod>(db, 'expensePeriods'),
        this.getAll<Breakdown>(db, 'breakdowns'),
        this.getAll<OtherExpense>(db, 'otherExpenses'),
        this.getAll<MaintenanceMilestone>(db, 'milestones'),
        this.getAll<PartDefinition>(db, 'parts'),
        this.getAll<PartOverride>(db, 'partOverrides'),
        this.getAll<HealthNotificationState>(db, 'healthNotificationState'),
        this.getAll<VehicleDocument>(db, 'vehicleDocuments'),
        this.getAll<PreTripCheck>(db, 'preTripChecks'),
        this.getAll<ChargeSession>(db, 'chargeSessions'),
      ]);

      let settings = normalizeSettings(settingsRaw);
      let cars = carsRaw.map(normalizeCar);
      const migrationTarget =
        cars.find((c) => c.id === settings.activeCarId) ??
        (cars.length === 1 ? cars[0]! : null);

      if (
        migrationTarget &&
        (settings.licenseExpiry || settings.registrationExpiry) &&
        (!migrationTarget.licenseExpiry || !migrationTarget.registrationExpiry)
      ) {
        const migrated: Car = {
          ...migrationTarget,
          licenseExpiry: migrationTarget.licenseExpiry ?? settings.licenseExpiry,
          registrationExpiry:
            migrationTarget.registrationExpiry ?? settings.registrationExpiry,
          updatedAt: nowIso(),
        };
        cars = cars.map((c) => (c.id === migrated.id ? migrated : c));
        settings = {
          ...settings,
          licenseExpiry: undefined,
          registrationExpiry: undefined,
        };
        await this.put('car', migrated);
        await this.put('settings', { id: 'settings', ...settings });
      }

      let periods = expensePeriods.map(normalizeExpensePeriod);
      const milestoneRows = milestones.map(normalizeMilestone);
      const seedPuts: Promise<void>[] = [];

      for (const c of cars) {
        if (!activePeriod(periods, c.id)) {
          const period = newOpenPeriod(c.id);
          periods = [...periods, period];
          seedPuts.push(this.put('expensePeriods', period));
        }
      }
      if (seedPuts.length) {
        await Promise.all(seedPuts);
      }

      const currency = settings.currency || DEFAULT_CURRENCY;
      let fillRows = fillUps.map((f) =>
        normalizeFillUp({ ...f, currency: f.currency ?? currency }),
      );
      let maintRows = maintenance.map(normalizeMaintenance);
      let breakdownRows = breakdowns.map((b) =>
        normalizeBreakdown({ ...b, currency: b.currency ?? currency }),
      );
      let otherRows = otherExpenses.map((o) =>
        normalizeOtherExpense({ ...o, currency: o.currency ?? currency }),
      );

      const needsHealthMigration = maintRows.some((m) => !m.partDefinitionId);
      let partRows = partsRaw.map(normalizePartDefinition);
      let overrideRows = overridesRaw.map(normalizePartOverride);
      const notifyRows = notifyRaw.map(normalizeHealthNotificationState);
      let docRows = vehicleDocsRaw.map(normalizeVehicleDocument);
      const preTripRows = preTripRaw.map(normalizePreTripCheck);
      const chargeRows = chargeRaw.map(normalizeChargeSession);

      // Vault SSOT: seed from Car license/registration when vault empty for kind.
      const vaultSeed: VehicleDocument[] = [];
      const seedTs = nowIso();
      for (const c of cars) {
        vaultSeed.push(...migrateCarExpiryToVault(c, docRows, seedTs));
      }
      if (vaultSeed.length) {
        docRows = [...docRows, ...vaultSeed];
        await Promise.all(vaultSeed.map((d) => this.put('vehicleDocuments', d)));
      }

      if (needsHealthMigration) {
        const migrated = migrateHealthV5(
          maintRows,
          milestoneRows,
          currency,
          partRows,
          overrideRows,
        );
        maintRows = migrated.maintenance;
        partRows = migrated.parts;
        overrideRows = migrated.partOverrides;
        await Promise.all([
          ...maintRows.map((m) => this.put('maintenance', m)),
          ...partRows.map((p) => this.put('parts', p)),
          ...overrideRows.map((o) => this.put('partOverrides', o)),
          ...fillRows.map((f) => this.put('fillUps', f)),
          ...breakdownRows.map((b) => this.put('breakdowns', b)),
          ...otherRows.map((o) => this.put('otherExpenses', o)),
        ]);
      } else {
        // Still stamp currency on legacy cost rows once if missing.
        const currencyPuts: Promise<void>[] = [];
        for (const f of fillRows) {
          if (!f.currency) {
            f.currency = currency;
            currencyPuts.push(this.put('fillUps', f));
          }
        }
        for (const b of breakdownRows) {
          if (!b.currency) {
            b.currency = currency;
            currencyPuts.push(this.put('breakdowns', b));
          }
        }
        for (const o of otherRows) {
          if (!o.currency) {
            o.currency = currency;
            currencyPuts.push(this.put('otherExpenses', o));
          }
        }
        if (currencyPuts.length) {
          await Promise.all(currencyPuts);
        }
      }

      const active =
        cars.find((c) => c.id === settings.activeCarId) ?? cars[0] ?? null;
      this._cars.set(cars);
      this._car.set(active);
      this._settings.set(settings);
      this._fillUpsAll.set(fillRows);
      this._maintenanceAll.set(maintRows);
      this._expensePeriodsAll.set(periods);
      this._breakdownsAll.set(breakdownRows);
      this._otherExpensesAll.set(otherRows);
      this._milestonesAll.set(milestoneRows);
      this._partsAll.set(partRows);
      this._partOverridesAll.set(overrideRows);
      this._healthNotificationStateAll.set(notifyRows);
      this._vehicleDocumentsAll.set(docRows);
      this._preTripChecksAll.set(preTripRows);
      this._chargeSessionsAll.set(chargeRows);
      if (active) {
        this.recalcOdometer();
      }
      this._ready.set(true);
    } catch (e) {
      this._error.set('persist.initFailed');
      this._ready.set(true);
      console.error(e);
    }
  }

  private filterForActiveCar<T extends { carId?: string }>(
    rows: readonly T[],
    carId: string | undefined,
  ): T[] {
    if (!carId) {
      return [];
    }
    return rows.filter((r) => r.carId == null || r.carId === carId);
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of SCHEMA_STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private put(store: string, value: unknown): Promise<void> {
    return this.open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(value);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  private deleteKey(store: string, key: string): Promise<void> {
    return this.open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  private async replaceAll(data: DbSnapshot): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...SCHEMA_STORES], 'readwrite');
      for (const store of SCHEMA_STORES) {
        tx.objectStore(store).clear();
      }
      for (const c of data.cars) {
        tx.objectStore('car').put(c);
      }
      tx.objectStore('settings').put({ id: 'settings', ...data.settings });
      for (const f of data.fillUps) {
        tx.objectStore('fillUps').put(f);
      }
      for (const m of data.maintenance) {
        tx.objectStore('maintenance').put(m);
      }
      for (const p of data.expensePeriods) {
        tx.objectStore('expensePeriods').put(p);
      }
      for (const b of data.breakdowns) {
        tx.objectStore('breakdowns').put(b);
      }
      for (const o of data.otherExpenses) {
        tx.objectStore('otherExpenses').put(o);
      }
      for (const m of data.milestones) {
        tx.objectStore('milestones').put(m);
      }
      for (const p of data.parts) {
        tx.objectStore('parts').put(p);
      }
      for (const o of data.partOverrides) {
        tx.objectStore('partOverrides').put(o);
      }
      for (const n of data.healthNotificationState) {
        tx.objectStore('healthNotificationState').put(n);
      }
      for (const d of data.vehicleDocuments) {
        tx.objectStore('vehicleDocuments').put(d);
      }
      for (const p of data.preTripChecks) {
        tx.objectStore('preTripChecks').put(p);
      }
      for (const c of data.chargeSessions) {
        tx.objectStore('chargeSessions').put(c);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.applySnapshot(data);
  }

  private applySnapshot(data: DbSnapshot): void {
    this._cars.set(data.cars);
    this._car.set(data.car);
    this._settings.set(data.settings);
    this._fillUpsAll.set(data.fillUps);
    this._maintenanceAll.set(data.maintenance);
    this._expensePeriodsAll.set(data.expensePeriods);
    this._breakdownsAll.set(data.breakdowns);
    this._otherExpensesAll.set(data.otherExpenses);
    this._milestonesAll.set(data.milestones);
    this._partsAll.set(data.parts);
    this._partOverridesAll.set(data.partOverrides);
    this._healthNotificationStateAll.set(data.healthNotificationState);
    this._vehicleDocumentsAll.set(data.vehicleDocuments);
    this._preTripChecksAll.set(data.preTripChecks);
    this._chargeSessionsAll.set(data.chargeSessions);
    if (data.car) {
      this.recalcOdometer();
    }
  }

  /** Active car maintenance currency, else settings (70B). */
  snapshotCurrency(): string {
    return (
      this._car()?.maintenanceCurrency ||
      this._settings().currency ||
      DEFAULT_CURRENCY
    );
  }

  /** Effective part = system/custom + override for active car. */
  resolveEffectivePart(partDefinitionId: string): PartDefinition | null {
    const base =
      this._partsAll().find((p) => p.id === partDefinitionId) ??
      systemPartById(partDefinitionId);
    if (!base) {
      return null;
    }
    const carId = this._car()?.id;
    if (!carId) {
      return base;
    }
    const ov = this._partOverridesAll().find(
      (o) => o.carId === carId && o.partDefinitionId === partDefinitionId,
    );
    if (!ov) {
      return base;
    }
    return {
      ...base,
      manufacturerIntervalKm: ov.manufacturerIntervalKm ?? base.manufacturerIntervalKm,
      manufacturerIntervalMonths:
        ov.manufacturerIntervalMonths ?? base.manufacturerIntervalMonths,
      userIntervalKm: ov.userIntervalKm ?? base.userIntervalKm,
      userIntervalMonths: ov.userIntervalMonths ?? base.userIntervalMonths,
      measurementRules: ov.measurementRules ?? base.measurementRules,
      expectedCost: ov.expectedCost ?? base.expectedCost,
      expectedCostCurrency: ov.expectedCostCurrency ?? base.expectedCostCurrency,
      active: ov.active === false ? false : base.active,
    };
  }

  recalcOdometer(): void {
    const car = this._car();
    if (!car) {
      return;
    }
    const next = roundOdometerKm(
      knownOdometer(car.initialOdometer, this.fillUps(), [
        ...this.maintenance(),
        ...this.chargeSessions(),
      ]),
    );
    if (next !== car.currentOdometer) {
      const updated: Car = { ...car, currentOdometer: next, updatedAt: nowIso() };
      this._car.set(updated);
      this._cars.set(this._cars().map((c) => (c.id === updated.id ? updated : c)));
      void this.put('car', updated);
    }
  }

  async createCar(
    nickname: string,
    initialOdometer: number,
    extras?: Partial<
      Pick<
        Car,
        | 'year'
        | 'make'
        | 'model'
        | 'plate'
        | 'licenseExpiry'
        | 'registrationExpiry'
        | 'tankCapacityLiters'
      >
    >,
  ): Promise<void> {
    const ts = nowIso();
    const car: Car = {
      id: crypto.randomUUID(),
      nickname: nickname.trim(),
      initialOdometer: roundOdometerKm(initialOdometer),
      currentOdometer: roundOdometerKm(initialOdometer),
      maintenanceCurrency: this._settings().currency || DEFAULT_CURRENCY,
      ...carDocFields(extras),
      createdAt: ts,
      updatedAt: ts,
    };
    const period = newOpenPeriod(car.id);
    await Promise.all([this.put('car', car), this.put('expensePeriods', period)]);
    const settings: Settings = { ...this._settings(), activeCarId: car.id };
    await this.put('settings', { id: 'settings', ...settings });
    this._cars.set([...this._cars(), car]);
    this._car.set(car);
    this._settings.set(settings);
    this._expensePeriodsAll.set([...this._expensePeriodsAll(), period]);
  }

  async switchCar(id: string): Promise<void> {
    const next = this._cars().find((c) => c.id === id);
    if (!next) {
      return;
    }
    const settings: Settings = { ...this._settings(), activeCarId: id };
    await this.put('settings', { id: 'settings', ...settings });
    this._car.set(next);
    this._settings.set(settings);
    this.recalcOdometer();
  }

  /** Install first-run demo car + rows and flag sampleMode. */
  async installSampleData(dataset: {
    car: Car;
    fillUps: FillUp[];
    maintenance: Maintenance[];
    partOverrides?: PartOverride[];
  }): Promise<void> {
    const period = newOpenPeriod(dataset.car.id);
    const overrides = dataset.partOverrides ?? [];
    await Promise.all([
      this.put('car', dataset.car),
      ...dataset.fillUps.map((f) => this.put('fillUps', f)),
      ...dataset.maintenance.map((m) => this.put('maintenance', m)),
      ...overrides.map((o) => this.put('partOverrides', o)),
      this.put('expensePeriods', period),
    ]);
    const settings: Settings = {
      ...this._settings(),
      activeCarId: dataset.car.id,
      sampleMode: true,
    };
    await this.put('settings', { id: 'settings', ...settings });
    this._cars.set([...this._cars(), dataset.car]);
    this._car.set(dataset.car);
    this._settings.set(settings);
    this._fillUpsAll.set([...this._fillUpsAll(), ...dataset.fillUps]);
    this._maintenanceAll.set([...this._maintenanceAll(), ...dataset.maintenance]);
    this._partOverridesAll.set([...this._partOverridesAll(), ...overrides]);
    this._expensePeriodsAll.set([...this._expensePeriodsAll(), period]);
    this.recalcOdometer();
  }

  /** Wipe the demo car and related rows, then exit sample mode. */
  async clearSampleData(sampleCarId: string): Promise<void> {
    await this.removeCar(sampleCarId);
    if (this._settings().sampleMode) {
      await this.updateSettings({ sampleMode: false });
    }
  }

  async updateCar(
    patch: Partial<
      Pick<
        Car,
        | 'nickname'
        | 'year'
        | 'make'
        | 'model'
        | 'plate'
        | 'licenseExpiry'
        | 'registrationExpiry'
        | 'tankCapacityLiters'
        | 'currentOdometer'
        | 'maintenanceBudgetMonthly'
        | 'reserveTargetMonthly'
        | 'maintenanceReserveBalance'
        | 'maintenanceCurrency'
        | 'activeTireSet'
        | 'tireSetSwappedAt'
      >
    >,
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const merged = { ...car, ...patch };
    const updated: Car = {
      ...merged,
      ...('year' in patch ||
      'make' in patch ||
      'model' in patch ||
      'plate' in patch ||
      'licenseExpiry' in patch ||
      'registrationExpiry' in patch ||
      'tankCapacityLiters' in patch
        ? carDocFields(merged)
        : {}),
      nickname: patch.nickname != null ? patch.nickname.trim() : car.nickname,
      currentOdometer:
        patch.currentOdometer != null
          ? roundOdometerKm(Number(patch.currentOdometer))
          : roundOdometerKm(car.currentOdometer),
      maintenanceBudgetMonthly: optFinite(merged.maintenanceBudgetMonthly),
      reserveTargetMonthly: optFinite(merged.reserveTargetMonthly),
      maintenanceReserveBalance: optFinite(merged.maintenanceReserveBalance),
      maintenanceCurrency: merged.maintenanceCurrency
        ? String(merged.maintenanceCurrency)
        : undefined,
      updatedAt: nowIso(),
    };
    await this.put('car', updated);
    this._car.set(updated);
    this._cars.set(this._cars().map((c) => (c.id === updated.id ? updated : c)));
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const next: Settings = {
      ...this._settings(),
      ...patch,
      unitSystem: DEFAULT_UNIT_SYSTEM,
    };
    if ('customMaintenanceTypes' in patch) {
      next.customMaintenanceTypes = normalizeCustomTypes(patch.customMaintenanceTypes);
    }
    await this.put('settings', { id: 'settings', ...next });
    this._settings.set(next);
  }

  async addCustomType(name: string): Promise<AddCustomTypeResult> {
    const result = addCustomMaintenanceType(
      this._settings().customMaintenanceTypes ?? [],
      name,
    );
    if (result.ok) {
      await this.updateSettings({ customMaintenanceTypes: result.list });
      this.flashSaved();
    }
    return result;
  }

  async removeCustomType(name: string): Promise<void> {
    const key = name.toLowerCase();
    await this.updateSettings({
      customMaintenanceTypes: (this._settings().customMaintenanceTypes ?? []).filter(
        (x) => x.toLowerCase() !== key,
      ),
    });
  }

  async saveFillUp(
    input: Omit<FillUp, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const ts = nowIso();
    const existing = input.id
      ? this._fillUpsAll().find((f) => f.id === input.id)
      : undefined;
    const row: FillUp = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      odometer: roundOdometerKm(input.odometer),
      distanceKm: input.distanceKm,
      liters: input.liters,
      cost: input.cost,
      fuelGrade: input.fuelGrade,
      unitPrice: input.unitPrice,
      tankFull: input.tankFull,
      note: input.note?.trim() || undefined,
      placeLabel: input.placeLabel?.trim() || undefined,
      date: input.date,
      lat: input.lat,
      lon: input.lon,
      tempC: input.tempC,
      weatherCode: input.weatherCode,
      currency: input.currency ?? existing?.currency ?? this.snapshotCurrency(),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('fillUps', row);
    const list = this._fillUpsAll().filter((f) => f.id !== row.id).concat(row);
    this._fillUpsAll.set(list);
    this.recalcOdometer();
    this.flashSaved();
  }

  async deleteFillUp(id: string): Promise<void> {
    await this.deleteKey('fillUps', id);
    this._fillUpsAll.set(this._fillUpsAll().filter((f) => f.id !== id));
    this.recalcOdometer();
  }

  async saveMaintenance(
    input: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const car = this._car();
    const ts = nowIso();
    const existing = input.id
      ? this._maintenanceAll().find((m) => m.id === input.id)
      : undefined;
    const costRaw = input.cost;
    const cost =
      costRaw == null || costRaw === ('' as unknown) || !Number.isFinite(Number(costRaw))
        ? undefined
        : Number(costRaw);
    const row: Maintenance = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? input.carId ?? car?.id,
      type: input.type,
      odometer: roundOdometerKm(input.odometer),
      cost,
      date: input.date,
      note: input.note?.trim() || undefined,
      dueKm: input.dueKm,
      dueDate: input.dueDate,
      partDefinitionId: input.partDefinitionId ?? existing?.partDefinitionId,
      recordType: input.recordType ?? existing?.recordType,
      measurements: input.measurements ?? existing?.measurements,
      condition: input.condition ?? existing?.condition,
      partModel: input.partModel?.trim() || existing?.partModel,
      partNumber: input.partNumber?.trim() || existing?.partNumber,
      currency: input.currency ?? existing?.currency ?? this.snapshotCurrency(),
      observations: input.observations ?? existing?.observations,
      odometerRollbackAcknowledged:
        input.odometerRollbackAcknowledged ?? existing?.odometerRollbackAcknowledged,
      ...maintenanceDetailFields(input),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('maintenance', row);
    const list = this._maintenanceAll().filter((m) => m.id !== row.id).concat(row);
    this._maintenanceAll.set(list);

    // Activate system/custom part when logged (95A).
    if (row.partDefinitionId && row.carId) {
      const sys = systemPartById(row.partDefinitionId);
      if (sys) {
        await this.savePartOverride({
          carId: row.carId,
          partDefinitionId: row.partDefinitionId,
          active: true,
        });
      } else {
        const custom = this._partsAll().find((p) => p.id === row.partDefinitionId);
        if (custom && !custom.active) {
          await this.savePart({ ...custom, active: true });
        }
      }
      // Update routine baseline when service/replacement on routine check.
      if (
        row.partDefinitionId === ROUTINE_CHECK_PART_ID &&
        (row.recordType === 'service' || row.recordType === 'replacement')
      ) {
        await this.savePartOverride({
          carId: row.carId,
          partDefinitionId: row.partDefinitionId,
          lastRoutineCheckKm: row.odometer,
        });
      }
    }

    this.recalcOdometer();
    this.flashSaved();
  }

  async savePart(
    input: Omit<PartDefinition, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: string;
    },
  ): Promise<PartDefinition> {
    const ts = nowIso();
    const existing = input.id
      ? this._partsAll().find((p) => p.id === input.id)
      : undefined;
    const row: PartDefinition = {
      ...input,
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      source: input.source ?? 'custom',
      trackingMode: (input.trackingMode ?? 'history') as PartTrackingMode,
      active: input.active !== false,
      createdAt: existing?.createdAt ?? input.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('parts', row);
    this._partsAll.set(this._partsAll().filter((p) => p.id !== row.id).concat(row));
    this.flashSaved();
    return row;
  }

  async savePartOverride(
    input: Omit<PartOverride, 'id' | 'updatedAt'> & { id?: string },
  ): Promise<PartOverride> {
    const ts = nowIso();
    const id = input.id ?? `${input.carId}:${input.partDefinitionId}`;
    const existing = this._partOverridesAll().find((o) => o.id === id);
    const row: PartOverride = {
      ...existing,
      ...input,
      id,
      updatedAt: ts,
    };
    await this.put('partOverrides', row);
    this._partOverridesAll.set(
      this._partOverridesAll().filter((o) => o.id !== row.id).concat(row),
    );
    this.flashSaved();
    return row;
  }

  async archivePart(partDefinitionId: string): Promise<void> {
    const carId = this._car()?.id;
    if (!carId) return;
    const custom = this._partsAll().find((p) => p.id === partDefinitionId);
    if (custom?.source === 'custom') {
      await this.savePart({ ...custom, active: false });
      return;
    }
    await this.savePartOverride({
      carId,
      partDefinitionId,
      active: false,
    });
  }

  async restorePart(partDefinitionId: string): Promise<void> {
    const carId = this._car()?.id;
    if (!carId) return;
    const custom = this._partsAll().find((p) => p.id === partDefinitionId);
    if (custom?.source === 'custom') {
      await this.savePart({ ...custom, active: true });
      return;
    }
    await this.savePartOverride({
      carId,
      partDefinitionId,
      active: true,
    });
  }

  async saveHealthNotificationState(
    input: Omit<HealthNotificationState, 'id' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const ts = nowIso();
    const id = input.id ?? `${input.carId}:${input.partDefinitionId}`;
    const existing = this._healthNotificationStateAll().find((n) => n.id === id);
    const row: HealthNotificationState = {
      ...existing,
      ...input,
      id,
      updatedAt: ts,
    };
    await this.put('healthNotificationState', row);
    this._healthNotificationStateAll.set(
      this._healthNotificationStateAll().filter((n) => n.id !== row.id).concat(row),
    );
  }

  async deleteMaintenance(id: string): Promise<void> {
    await this.deleteKey('maintenance', id);
    this._maintenanceAll.set(this._maintenanceAll().filter((m) => m.id !== id));
    this.recalcOdometer();
  }

  async saveBreakdown(
    input: Omit<Breakdown, 'id' | 'carId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const ts = nowIso();
    const existing = input.id
      ? this._breakdownsAll().find((b) => b.id === input.id)
      : undefined;
    const row: Breakdown = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      symptom: input.symptom.trim(),
      repairCost: input.repairCost,
      odometer: roundOdometerKm(input.odometer),
      date: input.date,
      shopName: input.shopName?.trim() || undefined,
      category: input.category,
      note: input.note?.trim() || undefined,
      currency: input.currency ?? existing?.currency ?? this.snapshotCurrency(),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('breakdowns', row);
    const list = this._breakdownsAll().filter((b) => b.id !== row.id).concat(row);
    this._breakdownsAll.set(list);
    this.flashSaved();
  }

  async deleteBreakdown(id: string): Promise<void> {
    await this.deleteKey('breakdowns', id);
    this._breakdownsAll.set(this._breakdownsAll().filter((b) => b.id !== id));
  }

  async saveOtherExpense(
    input: Omit<OtherExpense, 'id' | 'carId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const ts = nowIso();
    const existing = input.id
      ? this._otherExpensesAll().find((o) => o.id === input.id)
      : undefined;
    const row: OtherExpense = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      label: input.label.trim(),
      amount: input.amount,
      date: input.date,
      note: input.note?.trim() || undefined,
      currency: input.currency ?? existing?.currency ?? this.snapshotCurrency(),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('otherExpenses', row);
    const list = this._otherExpensesAll().filter((o) => o.id !== row.id).concat(row);
    this._otherExpensesAll.set(list);
    this.flashSaved();
  }

  async deleteOtherExpense(id: string): Promise<void> {
    await this.deleteKey('otherExpenses', id);
    this._otherExpensesAll.set(this._otherExpensesAll().filter((o) => o.id !== id));
  }

  async saveVehicleDocument(
    input: Omit<VehicleDocument, 'id' | 'carId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const ts = nowIso();
    const existing = input.id
      ? this._vehicleDocumentsAll().find((d) => d.id === input.id)
      : undefined;
    const row: VehicleDocument = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      kind: input.kind,
      label: input.kind === 'other' ? input.label?.trim() || undefined : undefined,
      expiryDate: input.expiryDate,
      note: input.note?.trim() || undefined,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('vehicleDocuments', row);
    const list = this._vehicleDocumentsAll().filter((d) => d.id !== row.id).concat(row);
    this._vehicleDocumentsAll.set(list);

    // Keep Car license/registration mirrors in sync for legacy dues callers.
    if (row.kind === 'license' || row.kind === 'registration') {
      const patch: Partial<Car> =
        row.kind === 'license'
          ? { licenseExpiry: row.expiryDate }
          : { registrationExpiry: row.expiryDate };
      await this.updateCar(patch);
    }
    this.flashSaved();
  }

  async deleteVehicleDocument(id: string): Promise<void> {
    await this.deleteKey('vehicleDocuments', id);
    this._vehicleDocumentsAll.set(this._vehicleDocumentsAll().filter((d) => d.id !== id));
  }

  async savePreTripCheck(
    input: Omit<PreTripCheck, 'id' | 'carId' | 'createdAt'> & { id?: string },
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const ts = nowIso();
    const existing = input.id
      ? this._preTripChecksAll().find((p) => p.id === input.id)
      : undefined;
    const row: PreTripCheck = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      date: input.date,
      items: { ...input.items },
      ready: input.ready,
      note: input.note?.trim() || undefined,
      createdAt: existing?.createdAt ?? ts,
    };
    await this.put('preTripChecks', row);
    const list = this._preTripChecksAll().filter((p) => p.id !== row.id).concat(row);
    this._preTripChecksAll.set(list);
    this.flashSaved();
  }

  async deletePreTripCheck(id: string): Promise<void> {
    await this.deleteKey('preTripChecks', id);
    this._preTripChecksAll.set(this._preTripChecksAll().filter((p) => p.id !== id));
  }

  async saveChargeSession(
    input: Omit<ChargeSession, 'id' | 'carId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const ts = nowIso();
    const existing = input.id
      ? this._chargeSessionsAll().find((c) => c.id === input.id)
      : undefined;
    const row: ChargeSession = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      odometer: roundOdometerKm(input.odometer),
      kWh: input.kWh,
      cost: input.cost,
      date: input.date,
      placeLabel: input.placeLabel?.trim() || undefined,
      note: input.note?.trim() || undefined,
      currency: input.currency ?? existing?.currency ?? this.snapshotCurrency(),
      distanceKm: input.distanceKm,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('chargeSessions', row);
    const list = this._chargeSessionsAll().filter((c) => c.id !== row.id).concat(row);
    this._chargeSessionsAll.set(list);
    this.recalcOdometer();
    this.flashSaved();
  }

  async deleteChargeSession(id: string): Promise<void> {
    await this.deleteKey('chargeSessions', id);
    this._chargeSessionsAll.set(this._chargeSessionsAll().filter((c) => c.id !== id));
    this.recalcOdometer();
  }

  async setActiveTireSet(set: 'A' | 'B', swappedAt?: string): Promise<void> {
    await this.updateCar({
      activeTireSet: set,
      tireSetSwappedAt: swappedAt,
    });
  }

  async saveMilestone(input: MaintenanceMilestone & { id?: string }): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const existing = input.id
      ? this._milestonesAll().find((m) => m.id === input.id)
      : undefined;
    const row: MaintenanceMilestone = {
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? car.id,
      targetKm: input.targetKm,
      scheduledDate: input.scheduledDate,
      tasks: input.tasks.map(normalizeMaintenanceTask),
    };
    await this.put('milestones', row);
    const list = this._milestonesAll().filter((m) => m.id !== row.id).concat(row);
    this._milestonesAll.set(list);
    this.flashSaved();
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.deleteKey('milestones', id);
    this._milestonesAll.set(this._milestonesAll().filter((m) => m.id !== id));
  }

  async startNewPeriod(
    carId: string,
    newStartDate: string,
    closeDate?: string,
  ): Promise<void> {
    const next = rollExpensePeriod(
      this._expensePeriodsAll(),
      carId,
      newStartDate,
      closeDate ?? newStartDate,
    );
    const added = next.filter(
      (p) => !this._expensePeriodsAll().some((existing) => existing.id === p.id),
    );
    const updated = next.filter((p) =>
      this._expensePeriodsAll().some((existing) => existing.id === p.id),
    );
    await Promise.all([
      ...updated.map((p) => this.put('expensePeriods', p)),
      ...added.map((p) => this.put('expensePeriods', p)),
    ]);
    this._expensePeriodsAll.set(next);
    this.flashSaved();
  }

  exportBackup(): BackupFile {
    const {
      assistantApiKey: _k,
      assistantBaseUrl: _b,
      assistantModel: _m,
      ...settings
    } = this._settings();
    return {
      version: BACKUP_VERSION,
      exportedAt: nowIso(),
      car: this._car(),
      cars: this._cars(),
      settings,
      fillUps: this._fillUpsAll(),
      maintenance: this._maintenanceAll(),
      expensePeriods: this._expensePeriodsAll(),
      breakdowns: this._breakdownsAll(),
      otherExpenses: this._otherExpensesAll(),
      milestones: this._milestonesAll(),
      parts: this._partsAll(),
      partOverrides: this._partOverridesAll(),
      healthNotificationState: this._healthNotificationStateAll(),
      vehicleDocuments: this._vehicleDocumentsAll(),
      preTripChecks: this._preTripChecksAll(),
      chargeSessions: this._chargeSessionsAll(),
    };
  }

  validateBackup(raw: unknown): BackupFile {
    if (!raw || typeof raw !== 'object') {
      throw new Error('backup.invalid');
    }
    const obj = raw as Record<string, unknown>;
    const version = obj['version'];
    if (
      version !== 1 &&
      version !== 2 &&
      version !== 3 &&
      version !== 4 &&
      version !== 5 &&
      version !== BACKUP_VERSION
    ) {
      throw new Error('backup.unsupportedVersion');
    }
    if (!Array.isArray(obj['fillUps']) || !Array.isArray(obj['maintenance'])) {
      throw new Error('backup.invalid');
    }
    if (!obj['settings'] || typeof obj['settings'] !== 'object') {
      throw new Error('backup.invalid');
    }
    const fillUps = (obj['fillUps'] as FillUp[]).map(normalizeFillUp);
    const maintenance = (obj['maintenance'] as Maintenance[]).map(normalizeMaintenance);
    const settings = normalizeSettings(obj['settings']);
    const carsRaw = Array.isArray(obj['cars']) ? (obj['cars'] as Car[]) : null;
    const cars = carsRaw?.length
      ? carsRaw.map(normalizeCar)
      : obj['car']
        ? [normalizeCar(obj['car'])]
        : [];
    const car =
      cars.find((c) => c.id === settings.activeCarId) ?? cars[0] ?? null;
    if (car && !settings.activeCarId) {
      settings.activeCarId = car.id;
    }
    const expensePeriods = Array.isArray(obj['expensePeriods'])
      ? (obj['expensePeriods'] as ExpensePeriod[]).map(normalizeExpensePeriod)
      : [];
    const breakdowns = Array.isArray(obj['breakdowns'])
      ? (obj['breakdowns'] as Breakdown[]).map(normalizeBreakdown)
      : [];
    const otherExpenses = Array.isArray(obj['otherExpenses'])
      ? (obj['otherExpenses'] as OtherExpense[]).map(normalizeOtherExpense)
      : [];
    const milestones = Array.isArray(obj['milestones'])
      ? (obj['milestones'] as MaintenanceMilestone[]).map(normalizeMilestone)
      : [];
    const parts = Array.isArray(obj['parts'])
      ? (obj['parts'] as PartDefinition[]).map(normalizePartDefinition)
      : [];
    const partOverrides = Array.isArray(obj['partOverrides'])
      ? (obj['partOverrides'] as PartOverride[]).map(normalizePartOverride)
      : [];
    const healthNotificationState = Array.isArray(obj['healthNotificationState'])
      ? (obj['healthNotificationState'] as HealthNotificationState[]).map(
          normalizeHealthNotificationState,
        )
      : [];
    const vehicleDocuments = Array.isArray(obj['vehicleDocuments'])
      ? (obj['vehicleDocuments'] as VehicleDocument[]).map(normalizeVehicleDocument)
      : [];
    const preTripChecks = Array.isArray(obj['preTripChecks'])
      ? (obj['preTripChecks'] as PreTripCheck[]).map(normalizePreTripCheck)
      : [];
    const chargeSessions = Array.isArray(obj['chargeSessions'])
      ? (obj['chargeSessions'] as ChargeSession[]).map(normalizeChargeSession)
      : [];
    return {
      version: BACKUP_VERSION,
      exportedAt: String(obj['exportedAt'] ?? nowIso()),
      car,
      cars: cars.length ? cars : undefined,
      settings,
      fillUps,
      maintenance,
      expensePeriods: expensePeriods.length ? expensePeriods : undefined,
      breakdowns: breakdowns.length ? breakdowns : undefined,
      otherExpenses: otherExpenses.length ? otherExpenses : undefined,
      milestones: milestones.length ? milestones : undefined,
      parts: parts.length ? parts : undefined,
      partOverrides: partOverrides.length ? partOverrides : undefined,
      healthNotificationState: healthNotificationState.length
        ? healthNotificationState
        : undefined,
      vehicleDocuments: vehicleDocuments.length ? vehicleDocuments : undefined,
      preTripChecks: preTripChecks.length ? preTripChecks : undefined,
      chargeSessions: chargeSessions.length ? chargeSessions : undefined,
    };
  }

  private carsFromBackup(backup: BackupFile): Car[] {
    if (backup.cars?.length) {
      return backup.cars;
    }
    return backup.car ? [backup.car] : [];
  }

  async importReplace(backup: BackupFile): Promise<void> {
    const cars = this.carsFromBackup(backup);
    const car =
      cars.find((c) => c.id === backup.settings.activeCarId) ?? cars[0] ?? null;
    const settings = car
      ? { ...backup.settings, activeCarId: car.id }
      : backup.settings;
    await this.replaceAll({
      cars,
      car,
      settings,
      fillUps: backup.fillUps,
      maintenance: backup.maintenance,
      expensePeriods: backup.expensePeriods ?? [],
      breakdowns: backup.breakdowns ?? [],
      otherExpenses: backup.otherExpenses ?? [],
      milestones: backup.milestones ?? [],
      parts: backup.parts ?? [],
      partOverrides: backup.partOverrides ?? [],
      healthNotificationState: backup.healthNotificationState ?? [],
      vehicleDocuments: backup.vehicleDocuments ?? [],
      preTripChecks: backup.preTripChecks ?? [],
      chargeSessions: backup.chargeSessions ?? [],
    });
  }

  async importMerge(backup: BackupFile): Promise<void> {
    const fillMap = mergeByUpdatedAt(
      this._fillUpsAll(),
      backup.fillUps,
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const maintMap = mergeByUpdatedAt(
      this._maintenanceAll(),
      backup.maintenance,
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const periodMap = new Map(this._expensePeriodsAll().map((p) => [p.id, p]));
    for (const p of backup.expensePeriods ?? []) {
      periodMap.set(p.id, p);
    }
    const breakdownMap = mergeByUpdatedAt(
      this._breakdownsAll(),
      backup.breakdowns ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const otherMap = mergeByUpdatedAt(
      this._otherExpensesAll(),
      backup.otherExpenses ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const milestoneMap = new Map(this._milestonesAll().map((m) => [m.id, m]));
    for (const m of backup.milestones ?? []) {
      milestoneMap.set(m.id, m);
    }
    const partMap = mergeByUpdatedAt(
      this._partsAll(),
      backup.parts ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const overrideMap = mergeByUpdatedAt(
      this._partOverridesAll(),
      backup.partOverrides ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const notifyMap = mergeByUpdatedAt(
      this._healthNotificationStateAll(),
      backup.healthNotificationState ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const docMap = mergeByUpdatedAt(
      this._vehicleDocumentsAll(),
      backup.vehicleDocuments ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const preTripMap = mergeByUpdatedAt(
      this._preTripChecksAll(),
      backup.preTripChecks ?? [],
      (x) => x.id,
      (x) => x.createdAt,
    );
    const chargeMap = mergeByUpdatedAt(
      this._chargeSessionsAll(),
      backup.chargeSessions ?? [],
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const carMap = mergeByUpdatedAt(
      this._cars(),
      this.carsFromBackup(backup),
      (x) => x.id,
      (x) => x.updatedAt,
    );
    const cars = [...carMap.values()];
    const car =
      cars.find((c) => c.id === backup.settings.activeCarId) ??
      cars.find((c) => c.id === this._settings().activeCarId) ??
      this._car() ??
      cars[0] ??
      null;
    const prevTypes = this._settings().customMaintenanceTypes ?? [];
    const incomingTypes = backup.settings.customMaintenanceTypes ?? [];
    const {
      assistantApiKey: _k,
      assistantBaseUrl: _b,
      assistantModel: _m,
      ...incomingSettings
    } = backup.settings;
    const settings = {
      ...this._settings(),
      ...incomingSettings,
      unitSystem: DEFAULT_UNIT_SYSTEM,
      activeCarId: car?.id ?? this._settings().activeCarId,
      customMaintenanceTypes: normalizeCustomTypes([...prevTypes, ...incomingTypes]),
    };
    await this.replaceAll({
      cars,
      car,
      settings,
      fillUps: [...fillMap.values()],
      maintenance: [...maintMap.values()],
      expensePeriods: [...periodMap.values()],
      breakdowns: [...breakdownMap.values()],
      otherExpenses: [...otherMap.values()],
      milestones: [...milestoneMap.values()],
      parts: [...partMap.values()],
      partOverrides: [...overrideMap.values()],
      healthNotificationState: [...notifyMap.values()],
      vehicleDocuments: [...docMap.values()],
      preTripChecks: [...preTripMap.values()],
      chargeSessions: [...chargeMap.values()],
    });
  }

  /** Wipe all stores and reset settings. */
  async wipeAll(): Promise<void> {
    await this.replaceAll({
      cars: [],
      car: null,
      settings: defaultSettings(),
      fillUps: [],
      maintenance: [],
      expensePeriods: [],
      breakdowns: [],
      otherExpenses: [],
      milestones: [],
      parts: [],
      partOverrides: [],
      healthNotificationState: [],
      vehicleDocuments: [],
      preTripChecks: [],
      chargeSessions: [],
    });
  }

  /**
   * Delete one car and its related rows.
   * Legacy rows without carId belong to this car when it is the only or active car.
   * Last car → wipeAll (settings reset too).
   */
  async removeCar(id: string): Promise<void> {
    const db = await this.open();
    const cars = await this.getAll<Car>(db, 'car');
    const remaining = cars.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      await this.wipeAll();
      return;
    }

    const wasOnly = cars.length <= 1;
    const wasActive =
      wasOnly || this._car()?.id === id || this._settings().activeCarId === id;
    const drop = (row: { carId?: string }): boolean =>
      row.carId === id || (row.carId == null && wasActive);

    const droppedFill = this._fillUpsAll().filter(drop);
    const droppedMaint = this._maintenanceAll().filter(drop);
    const droppedPeriods = this._expensePeriodsAll().filter((p) => p.carId === id);
    const droppedBreakdowns = this._breakdownsAll().filter((b) => b.carId === id);
    const droppedOther = this._otherExpensesAll().filter((o) => o.carId === id);
    const droppedMilestones = this._milestonesAll().filter((m) => m.carId === id);
    const droppedParts = this._partsAll().filter((p) => p.carId === id);
    const droppedOverrides = this._partOverridesAll().filter((o) => o.carId === id);
    const droppedNotify = this._healthNotificationStateAll().filter((n) => n.carId === id);
    const droppedDocs = this._vehicleDocumentsAll().filter((d) => d.carId === id);
    const droppedPreTrip = this._preTripChecksAll().filter((p) => p.carId === id);
    const droppedCharge = this._chargeSessionsAll().filter((c) => c.carId === id);

    const fillUps = this._fillUpsAll().filter((f) => !drop(f));
    const maintenance = this._maintenanceAll().filter((m) => !drop(m));
    const expensePeriods = this._expensePeriodsAll().filter((p) => p.carId !== id);
    const breakdowns = this._breakdownsAll().filter((b) => b.carId !== id);
    const otherExpenses = this._otherExpensesAll().filter((o) => o.carId !== id);
    const milestones = this._milestonesAll().filter((m) => m.carId !== id);
    const parts = this._partsAll().filter((p) => p.carId !== id);
    const partOverrides = this._partOverridesAll().filter((o) => o.carId !== id);
    const healthNotificationState = this._healthNotificationStateAll().filter(
      (n) => n.carId !== id,
    );
    const vehicleDocuments = this._vehicleDocumentsAll().filter((d) => d.carId !== id);
    const preTripChecks = this._preTripChecksAll().filter((p) => p.carId !== id);
    const chargeSessions = this._chargeSessionsAll().filter((c) => c.carId !== id);
    const next = remaining.find((c) => c.id === this._settings().activeCarId) ?? remaining[0];
    const settings: Settings = {
      ...this._settings(),
      activeCarId: next.id,
    };

    await this.deleteKey('car', id);
    await Promise.all([
      ...droppedFill.map((f) => this.deleteKey('fillUps', f.id)),
      ...droppedMaint.map((m) => this.deleteKey('maintenance', m.id)),
      ...droppedPeriods.map((p) => this.deleteKey('expensePeriods', p.id)),
      ...droppedBreakdowns.map((b) => this.deleteKey('breakdowns', b.id)),
      ...droppedOther.map((o) => this.deleteKey('otherExpenses', o.id)),
      ...droppedMilestones.map((m) => this.deleteKey('milestones', m.id)),
      ...droppedParts.map((p) => this.deleteKey('parts', p.id)),
      ...droppedOverrides.map((o) => this.deleteKey('partOverrides', o.id)),
      ...droppedNotify.map((n) => this.deleteKey('healthNotificationState', n.id)),
      ...droppedDocs.map((d) => this.deleteKey('vehicleDocuments', d.id)),
      ...droppedPreTrip.map((p) => this.deleteKey('preTripChecks', p.id)),
      ...droppedCharge.map((c) => this.deleteKey('chargeSessions', c.id)),
    ]);
    await this.put('settings', { id: 'settings', ...settings });

    this._cars.set(remaining);
    this._car.set(next);
    this._settings.set(settings);
    this._fillUpsAll.set(fillUps);
    this._maintenanceAll.set(maintenance);
    this._expensePeriodsAll.set(expensePeriods);
    this._breakdownsAll.set(breakdowns);
    this._otherExpensesAll.set(otherExpenses);
    this._milestonesAll.set(milestones);
    this._partsAll.set(parts);
    this._partOverridesAll.set(partOverrides);
    this._healthNotificationStateAll.set(healthNotificationState);
    this._vehicleDocumentsAll.set(vehicleDocuments);
    this._preTripChecksAll.set(preTripChecks);
    this._chargeSessionsAll.set(chargeSessions);
    this.recalcOdometer();
  }

  private flashSaved(): void {
    this._savedFlash.set(true);
    setTimeout(() => this._savedFlash.set(false), 2200);
  }
}

function optFinite(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Newer updatedAt wins; equal → imported wins (82A). */
function mergeByUpdatedAt<T>(
  existing: readonly T[],
  incoming: readonly T[],
  idOf: (x: T) => string,
  updatedOf: (x: T) => string | undefined,
): Map<string, T> {
  const map = new Map(existing.map((x) => [idOf(x), x]));
  for (const row of incoming) {
    const id = idOf(row);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, row);
      continue;
    }
    const a = updatedOf(prev) ?? '';
    const b = updatedOf(row) ?? '';
    if (b >= a) {
      map.set(id, row);
    }
  }
  return map;
}

function carMetaFields(
  o?: Partial<Pick<Car, 'year' | 'make' | 'model'>> | null,
): Pick<Car, 'year' | 'make' | 'model'> {
  return {
    year: o?.year ? String(o.year) : undefined,
    make: o?.make ? String(o.make) : undefined,
    model: o?.model ? String(o.model) : undefined,
  };
}

function carDocFields(
  o?: Partial<
    Pick<
      Car,
      | 'year'
      | 'make'
      | 'model'
      | 'plate'
      | 'licenseExpiry'
      | 'registrationExpiry'
      | 'tankCapacityLiters'
    >
  > | null,
): Pick<
  Car,
  | 'year'
  | 'make'
  | 'model'
  | 'plate'
  | 'licenseExpiry'
  | 'registrationExpiry'
  | 'tankCapacityLiters'
> {
  return {
    ...carMetaFields(o),
    plate: o?.plate ? String(o.plate).trim() : undefined,
    licenseExpiry: o?.licenseExpiry ? String(o.licenseExpiry) : undefined,
    registrationExpiry: o?.registrationExpiry ? String(o.registrationExpiry) : undefined,
    tankCapacityLiters:
      o?.tankCapacityLiters == null || !Number.isFinite(Number(o.tankCapacityLiters))
        ? undefined
        : Number(o.tankCapacityLiters),
  };
}

function normalizeCar(raw: unknown): Car {
  const o = raw as Car;
  if (!o?.id || typeof o.nickname !== 'string') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    nickname: String(o.nickname),
    initialOdometer: Number(o.initialOdometer),
    currentOdometer: Number(o.currentOdometer),
    ...carDocFields(o),
    activeTireSet: o.activeTireSet === 'B' ? 'B' : o.activeTireSet === 'A' ? 'A' : undefined,
    tireSetSwappedAt: o.tireSetSwappedAt ? String(o.tireSetSwappedAt) : undefined,
    maintenanceBudgetMonthly: optFinite(o.maintenanceBudgetMonthly),
    reserveTargetMonthly: optFinite(o.reserveTargetMonthly),
    maintenanceReserveBalance: optFinite(o.maintenanceReserveBalance),
    maintenanceCurrency: o.maintenanceCurrency
      ? String(o.maintenanceCurrency)
      : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

function normalizeFillUp(raw: unknown): FillUp {
  const o = raw as FillUp;
  if (!o?.id || typeof o.odometer !== 'number') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    odometer: Number(o.odometer),
    distanceKm:
      o.distanceKm == null || !Number.isFinite(Number(o.distanceKm))
        ? undefined
        : Number(o.distanceKm),
    liters: Number(o.liters),
    cost: Number(o.cost),
    tankFull: Boolean(o.tankFull),
    note: o.note ? String(o.note) : undefined,
    date: String(o.date),
    lat: o.lat == null ? undefined : Number(o.lat),
    lon: o.lon == null ? undefined : Number(o.lon),
    tempC: o.tempC == null ? undefined : Number(o.tempC),
    weatherCode: o.weatherCode == null ? undefined : Number(o.weatherCode),
    fuelGrade: o.fuelGrade ? (o.fuelGrade as FillUp['fuelGrade']) : undefined,
    unitPrice: o.unitPrice == null ? undefined : Number(o.unitPrice),
    placeLabel: o.placeLabel ? String(o.placeLabel) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

function normalizeMaintenance(raw: unknown): Maintenance {
  const o = raw as Maintenance;
  if (!o?.id || !MAINTENANCE_TYPES.includes(o.type)) {
    throw new Error('backup.invalid');
  }
  const cost =
    o.cost == null || o.cost === ('' as unknown) || !Number.isFinite(Number(o.cost))
      ? undefined
      : Number(o.cost);
  const recordType =
    o.recordType && MAINTENANCE_RECORD_TYPES.includes(o.recordType)
      ? o.recordType
      : undefined;
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    type: o.type,
    odometer: Number(o.odometer),
    cost,
    date: String(o.date),
    note: o.note ? String(o.note) : undefined,
    dueKm: o.dueKm == null ? undefined : Number(o.dueKm),
    dueDate: o.dueDate ? String(o.dueDate) : undefined,
    partDefinitionId: o.partDefinitionId ? String(o.partDefinitionId) : undefined,
    recordType,
    measurements: Array.isArray(o.measurements) ? o.measurements : undefined,
    condition:
      o.condition && PART_CONDITIONS.includes(o.condition) ? o.condition : undefined,
    partModel: o.partModel ? String(o.partModel) : undefined,
    partNumber: o.partNumber ? String(o.partNumber) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    observations: Array.isArray(o.observations) ? o.observations : undefined,
    odometerRollbackAcknowledged: o.odometerRollbackAcknowledged === true ? true : undefined,
    ...maintenanceDetailFields(o),
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

function normalizeExpensePeriod(raw: unknown): ExpensePeriod {
  const o = raw as ExpensePeriod;
  if (!o?.id || !o.carId || !o.startDate) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    startDate: String(o.startDate),
    endDate: o.endDate ? String(o.endDate) : undefined,
  };
}

function normalizeBreakdown(raw: unknown): Breakdown {
  const o = raw as Breakdown;
  if (
    !o?.id ||
    !o.carId ||
    typeof o.symptom !== 'string' ||
    !BREAKDOWN_CATEGORIES.includes(o.category)
  ) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    symptom: String(o.symptom),
    repairCost: Number(o.repairCost),
    odometer: Number(o.odometer),
    date: String(o.date),
    shopName: o.shopName ? String(o.shopName) : undefined,
    category: o.category,
    note: o.note ? String(o.note) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

function normalizeOtherExpense(raw: unknown): OtherExpense {
  const o = raw as OtherExpense;
  if (!o?.id || !o.carId || typeof o.label !== 'string') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    label: String(o.label),
    amount: Number(o.amount),
    date: String(o.date),
    note: o.note ? String(o.note) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

const MILESTONE_TASK_KINDS: readonly MilestoneTaskKind[] = [
  'oil',
  'filter',
  'tires',
  'brakes',
  'labor',
  'custom',
] as const;

function normalizeMaintenanceTask(raw: unknown): MaintenanceTask {
  const o = raw as MaintenanceTask;
  if (!o?.id || !MILESTONE_TASK_KINDS.includes(o.kind)) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    kind: o.kind,
    label: o.label ? String(o.label) : undefined,
    intervalKm: o.intervalKm == null ? undefined : Number(o.intervalKm),
    lastDoneKm: o.lastDoneKm == null ? undefined : Number(o.lastDoneKm),
    maintenanceId: o.maintenanceId ? String(o.maintenanceId) : undefined,
  };
}

function normalizeMilestone(raw: unknown): MaintenanceMilestone {
  const o = raw as MaintenanceMilestone;
  if (!o?.id || !o.carId || typeof o.targetKm !== 'number') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    targetKm: Number(o.targetKm),
    scheduledDate: o.scheduledDate ? String(o.scheduledDate) : undefined,
    tasks: Array.isArray(o.tasks) ? o.tasks.map(normalizeMaintenanceTask) : [],
  };
}

function isTheme(v: unknown): v is Theme {
  return (THEMES as readonly string[]).includes(String(v));
}

function isLook(v: unknown): v is Look {
  return (LOOKS as readonly string[]).includes(String(v));
}

function normalizeSettings(raw: unknown): Settings {
  const o = raw as Settings;
  const soon =
    o.soonThresholdRatio == null ? DEFAULT_SOON_THRESHOLD : Number(o.soonThresholdRatio);
  return {
    language: o.language === 'en' ? 'en' : 'ar',
    theme: isTheme(o.theme) ? o.theme : DEFAULT_THEME,
    look: isLook(o.look) ? o.look : DEFAULT_LOOK,
    currency: String(o.currency || DEFAULT_CURRENCY),
    unitSystem: DEFAULT_UNIT_SYSTEM,
    installBannerDismissed: Boolean(o.installBannerDismissed),
    remindersEnabled: o.remindersEnabled === true,
    activeCarId: o.activeCarId ? String(o.activeCarId) : undefined,
    duskAssistEnabled: o.duskAssistEnabled === true ? true : undefined,
    lastSeenWhatsNewId: o.lastSeenWhatsNewId
      ? String(o.lastSeenWhatsNewId)
      : undefined,
    sampleMode: o.sampleMode === true ? true : undefined,
    checklistDismissed: o.checklistDismissed === true ? true : undefined,
    installCardDismissed: o.installCardDismissed === true ? true : undefined,
    setupCompletedAt: o.setupCompletedAt ? String(o.setupCompletedAt) : undefined,
    firstRealFillAt: o.firstRealFillAt ? String(o.firstRealFillAt) : undefined,
    firstDueAt: o.firstDueAt ? String(o.firstDueAt) : undefined,
    customMaintenanceTypes: normalizeCustomTypes(o.customMaintenanceTypes),
    // Persist online toggle; discard legacy BYOK key fields.
    assistantEnabled: o.assistantEnabled === false ? false : true,
    soonThresholdRatio: Number.isFinite(soon) ? soon : DEFAULT_SOON_THRESHOLD,
    notifyMaintenance: o.notifyMaintenance === false ? false : true,
    notifyBudget: o.notifyBudget === false ? false : true,
    notifyForecast: o.notifyForecast === false ? false : true,
    fuelTipText: o.fuelTipText ? String(o.fuelTipText) : undefined,
    fuelTipDay: o.fuelTipDay ? String(o.fuelTipDay) : undefined,
    healthInsightText: o.healthInsightText ? String(o.healthInsightText) : undefined,
    healthInsightDay: o.healthInsightDay ? String(o.healthInsightDay) : undefined,
    licenseExpiry: o.licenseExpiry ? String(o.licenseExpiry) : undefined,
    registrationExpiry: o.registrationExpiry
      ? String(o.registrationExpiry)
      : undefined,
  };
}

const TRACKING_MODES: readonly PartTrackingMode[] = [
  'interval',
  'measurement',
  'condition',
  'history',
  'none',
];

function normalizePartDefinition(raw: unknown): PartDefinition {
  const o = raw as PartDefinition;
  if (!o?.id || !PART_CATEGORIES.includes(o.category)) {
    throw new Error('backup.invalid');
  }
  const trackingMode = TRACKING_MODES.includes(o.trackingMode as PartTrackingMode)
    ? (o.trackingMode as PartTrackingMode)
    : 'history';
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    name: o.name ? String(o.name) : undefined,
    labelKey: o.labelKey ? String(o.labelKey) : undefined,
    category: o.category,
    source: o.source === 'system' ? 'system' : 'custom',
    trackingMode,
    intervalKm: optFinite(o.intervalKm),
    intervalMonths: optFinite(o.intervalMonths),
    manufacturerIntervalKm: optFinite(o.manufacturerIntervalKm),
    manufacturerIntervalMonths: optFinite(o.manufacturerIntervalMonths),
    userIntervalKm: optFinite(o.userIntervalKm),
    userIntervalMonths: optFinite(o.userIntervalMonths),
    measurementRules: Array.isArray(o.measurementRules) ? o.measurementRules : undefined,
    expectedCost: optFinite(o.expectedCost),
    expectedCostCurrency: o.expectedCostCurrency
      ? String(o.expectedCostCurrency)
      : undefined,
    unit: o.unit ? String(o.unit) : undefined,
    active: o.active !== false,
    notes: o.notes ? String(o.notes) : undefined,
    createdAt: String(o.createdAt ?? nowIso()),
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

function normalizePartOverride(raw: unknown): PartOverride {
  const o = raw as PartOverride;
  if (!o?.id || !o.carId || !o.partDefinitionId) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    partDefinitionId: String(o.partDefinitionId),
    manufacturerIntervalKm: optFinite(o.manufacturerIntervalKm),
    manufacturerIntervalMonths: optFinite(o.manufacturerIntervalMonths),
    userIntervalKm: optFinite(o.userIntervalKm),
    userIntervalMonths: optFinite(o.userIntervalMonths),
    measurementRules: Array.isArray(o.measurementRules) ? o.measurementRules : undefined,
    expectedCost: optFinite(o.expectedCost),
    expectedCostCurrency: o.expectedCostCurrency
      ? String(o.expectedCostCurrency)
      : undefined,
    lastRoutineCheckKm: optFinite(o.lastRoutineCheckKm),
    active: o.active,
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

function normalizeHealthNotificationState(raw: unknown): HealthNotificationState {
  const o = raw as HealthNotificationState;
  if (!o?.id || !o.carId || !o.partDefinitionId) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    partDefinitionId: String(o.partDefinitionId),
    lastStatus: o.lastStatus,
    lastNotifiedStatus: o.lastNotifiedStatus,
    lastBudgetHealth: o.lastBudgetHealth ? String(o.lastBudgetHealth) : undefined,
    lastForecastFlag: o.lastForecastFlag ? String(o.lastForecastFlag) : undefined,
    baselinedAt: o.baselinedAt ? String(o.baselinedAt) : undefined,
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

const VEHICLE_DOC_KINDS: readonly VehicleDocKind[] = [
  'license',
  'registration',
  'insurance',
  'inspection',
  'other',
];

function normalizeVehicleDocument(raw: unknown): VehicleDocument {
  const o = raw as VehicleDocument;
  if (!o?.id || !o.carId || !o.expiryDate) {
    throw new Error('backup.invalid');
  }
  const kind = VEHICLE_DOC_KINDS.includes(o.kind) ? o.kind : 'other';
  return {
    id: String(o.id),
    carId: String(o.carId),
    kind,
    label: o.label ? String(o.label) : undefined,
    expiryDate: String(o.expiryDate),
    note: o.note ? String(o.note) : undefined,
    createdAt: String(o.createdAt ?? nowIso()),
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

function normalizePreTripCheck(raw: unknown): PreTripCheck {
  const o = raw as PreTripCheck;
  if (!o?.id || !o.carId || !o.date) {
    throw new Error('backup.invalid');
  }
  const items = {} as Record<PreTripItemId, boolean>;
  for (const id of PRE_TRIP_ITEM_IDS) {
    items[id] = Boolean(o.items?.[id]);
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    date: String(o.date),
    items,
    ready: Boolean(o.ready),
    note: o.note ? String(o.note) : undefined,
    createdAt: String(o.createdAt ?? nowIso()),
  };
}

function normalizeChargeSession(raw: unknown): ChargeSession {
  const o = raw as ChargeSession;
  if (!o?.id || !o.carId || typeof o.odometer !== 'number') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    odometer: Number(o.odometer),
    kWh: Number(o.kWh),
    cost: Number(o.cost),
    date: String(o.date),
    placeLabel: o.placeLabel ? String(o.placeLabel) : undefined,
    note: o.note ? String(o.note) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    distanceKm: optFinite(o.distanceKm),
    createdAt: String(o.createdAt ?? nowIso()),
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}
