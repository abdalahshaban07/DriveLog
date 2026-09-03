import { Injectable, computed, signal } from '@angular/core';
import {
  BACKUP_VERSION,
  DB_NAME,
  DB_VERSION,
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  DEFAULT_UNIT_SYSTEM,
  SCHEMA_STORES,
} from '../core/config';
import { knownOdometer } from '../domain/economy';
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
import { seedMilestone } from '../domain/milestones';
import {
  BREAKDOWN_CATEGORIES,
  MAINTENANCE_TYPES,
  THEMES,
  type BackupFile,
  type Breakdown,
  type Car,
  type ExpensePeriod,
  type FillUp,
  type Maintenance,
  type MaintenanceMilestone,
  type MaintenanceTask,
  type MilestoneTaskKind,
  type OtherExpense,
  type Settings,
  type Theme,
} from '../domain/models';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultSettings(): Settings {
  return {
    language: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    currency: DEFAULT_CURRENCY,
    unitSystem: DEFAULT_UNIT_SYSTEM,
    installBannerDismissed: false,
    remindersEnabled: false,
    customMaintenanceTypes: [],
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
      let milestoneRows = milestones.map(normalizeMilestone);
      const seedPuts: Promise<void>[] = [];

      for (const c of cars) {
        if (!activePeriod(periods, c.id)) {
          const period = newOpenPeriod(c.id);
          periods = [...periods, period];
          seedPuts.push(this.put('expensePeriods', period));
        }
        if (!milestoneRows.some((m) => m.carId === c.id)) {
          const milestone = seedMilestone(c.id, c.currentOdometer);
          milestoneRows = [...milestoneRows, milestone];
          seedPuts.push(this.put('milestones', milestone));
        }
      }
      if (seedPuts.length) {
        await Promise.all(seedPuts);
      }

      const active =
        cars.find((c) => c.id === settings.activeCarId) ?? cars[0] ?? null;
      this._cars.set(cars);
      this._car.set(active);
      this._settings.set(settings);
      this._fillUpsAll.set(fillUps);
      this._maintenanceAll.set(maintenance.map(normalizeMaintenance));
      this._expensePeriodsAll.set(periods);
      this._breakdownsAll.set(breakdowns.map(normalizeBreakdown));
      this._otherExpensesAll.set(otherExpenses.map(normalizeOtherExpense));
      this._milestonesAll.set(milestoneRows);
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
    if (data.car) {
      this.recalcOdometer();
    }
  }

  recalcOdometer(): void {
    const car = this._car();
    if (!car) {
      return;
    }
    const next = knownOdometer(car.initialOdometer, this.fillUps(), this.maintenance());
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
        | 'vin'
        | 'year'
        | 'make'
        | 'model'
        | 'recallCount'
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
      initialOdometer,
      currentOdometer: initialOdometer,
      ...carDocFields(extras),
      createdAt: ts,
      updatedAt: ts,
    };
    const period = newOpenPeriod(car.id);
    const milestone = seedMilestone(car.id, car.currentOdometer);
    await Promise.all([
      this.put('car', car),
      this.put('expensePeriods', period),
      this.put('milestones', milestone),
    ]);
    const settings: Settings = { ...this._settings(), activeCarId: car.id };
    await this.put('settings', { id: 'settings', ...settings });
    this._cars.set([...this._cars(), car]);
    this._car.set(car);
    this._settings.set(settings);
    this._expensePeriodsAll.set([...this._expensePeriodsAll(), period]);
    this._milestonesAll.set([...this._milestonesAll(), milestone]);
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
  }): Promise<void> {
    const period = newOpenPeriod(dataset.car.id);
    await Promise.all([
      this.put('car', dataset.car),
      ...dataset.fillUps.map((f) => this.put('fillUps', f)),
      ...dataset.maintenance.map((m) => this.put('maintenance', m)),
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
        | 'vin'
        | 'year'
        | 'make'
        | 'model'
        | 'recallCount'
        | 'plate'
        | 'licenseExpiry'
        | 'registrationExpiry'
        | 'tankCapacityLiters'
        | 'currentOdometer'
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
      ...('vin' in patch ||
      'year' in patch ||
      'make' in patch ||
      'model' in patch ||
      'recallCount' in patch ||
      'plate' in patch ||
      'licenseExpiry' in patch ||
      'registrationExpiry' in patch ||
      'tankCapacityLiters' in patch
        ? carDocFields(merged)
        : {}),
      nickname: patch.nickname != null ? patch.nickname.trim() : car.nickname,
      currentOdometer:
        patch.currentOdometer != null ? Number(patch.currentOdometer) : car.currentOdometer,
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
      odometer: input.odometer,
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
    const row: Maintenance = {
      id: existing?.id ?? crypto.randomUUID(),
      carId: existing?.carId ?? input.carId ?? car?.id,
      type: input.type,
      odometer: input.odometer,
      cost: input.cost,
      date: input.date,
      note: input.note?.trim() || undefined,
      dueKm: input.dueKm,
      dueDate: input.dueDate,
      ...maintenanceDetailFields(input),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('maintenance', row);
    const list = this._maintenanceAll().filter((m) => m.id !== row.id).concat(row);
    this._maintenanceAll.set(list);
    this.recalcOdometer();
    this.flashSaved();
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
      odometer: input.odometer,
      date: input.date,
      shopName: input.shopName?.trim() || undefined,
      category: input.category,
      note: input.note?.trim() || undefined,
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
    const { assistantApiKey: _removed, ...settings } = this._settings();
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
    });
  }

  async importMerge(backup: BackupFile): Promise<void> {
    const fillMap = new Map(this._fillUpsAll().map((f) => [f.id, f]));
    for (const f of backup.fillUps) {
      fillMap.set(f.id, f);
    }
    const maintMap = new Map(this._maintenanceAll().map((m) => [m.id, m]));
    for (const m of backup.maintenance) {
      maintMap.set(m.id, m);
    }
    const periodMap = new Map(this._expensePeriodsAll().map((p) => [p.id, p]));
    for (const p of backup.expensePeriods ?? []) {
      periodMap.set(p.id, p);
    }
    const breakdownMap = new Map(this._breakdownsAll().map((b) => [b.id, b]));
    for (const b of backup.breakdowns ?? []) {
      breakdownMap.set(b.id, b);
    }
    const otherMap = new Map(this._otherExpensesAll().map((o) => [o.id, o]));
    for (const o of backup.otherExpenses ?? []) {
      otherMap.set(o.id, o);
    }
    const milestoneMap = new Map(this._milestonesAll().map((m) => [m.id, m]));
    for (const m of backup.milestones ?? []) {
      milestoneMap.set(m.id, m);
    }
    const carMap = new Map(this._cars().map((c) => [c.id, c]));
    for (const c of this.carsFromBackup(backup)) {
      carMap.set(c.id, c);
    }
    const cars = [...carMap.values()];
    const car =
      cars.find((c) => c.id === backup.settings.activeCarId) ??
      cars.find((c) => c.id === this._settings().activeCarId) ??
      this._car() ??
      cars[0] ??
      null;
    const prevTypes = this._settings().customMaintenanceTypes ?? [];
    const incomingTypes = backup.settings.customMaintenanceTypes ?? [];
    const settings = {
      ...this._settings(),
      ...backup.settings,
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

    const fillUps = this._fillUpsAll().filter((f) => !drop(f));
    const maintenance = this._maintenanceAll().filter((m) => !drop(m));
    const expensePeriods = this._expensePeriodsAll().filter((p) => p.carId !== id);
    const breakdowns = this._breakdownsAll().filter((b) => b.carId !== id);
    const otherExpenses = this._otherExpensesAll().filter((o) => o.carId !== id);
    const milestones = this._milestonesAll().filter((m) => m.carId !== id);
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
    this.recalcOdometer();
  }

  private flashSaved(): void {
    this._savedFlash.set(true);
    setTimeout(() => this._savedFlash.set(false), 1200);
  }
}

function carVinFields(
  o?: Partial<Pick<Car, 'vin' | 'year' | 'make' | 'model' | 'recallCount'>> | null,
): Pick<Car, 'vin' | 'year' | 'make' | 'model' | 'recallCount'> {
  return {
    vin: o?.vin ? String(o.vin) : undefined,
    year: o?.year ? String(o.year) : undefined,
    make: o?.make ? String(o.make) : undefined,
    model: o?.model ? String(o.model) : undefined,
    recallCount:
      o?.recallCount == null || !Number.isFinite(Number(o.recallCount))
        ? undefined
        : Number(o.recallCount),
  };
}

function carDocFields(
  o?: Partial<
    Pick<
      Car,
      | 'vin'
      | 'year'
      | 'make'
      | 'model'
      | 'recallCount'
      | 'plate'
      | 'licenseExpiry'
      | 'registrationExpiry'
      | 'tankCapacityLiters'
    >
  > | null,
): Pick<
  Car,
  | 'vin'
  | 'year'
  | 'make'
  | 'model'
  | 'recallCount'
  | 'plate'
  | 'licenseExpiry'
  | 'registrationExpiry'
  | 'tankCapacityLiters'
> {
  return {
    ...carVinFields(o),
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
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

function normalizeMaintenance(raw: unknown): Maintenance {
  const o = raw as Maintenance;
  if (!o?.id || !MAINTENANCE_TYPES.includes(o.type)) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    type: o.type,
    odometer: Number(o.odometer),
    cost: Number(o.cost),
    date: String(o.date),
    note: o.note ? String(o.note) : undefined,
    dueKm: o.dueKm == null ? undefined : Number(o.dueKm),
    dueDate: o.dueDate ? String(o.dueDate) : undefined,
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

function normalizeSettings(raw: unknown): Settings {
  const o = raw as Settings;
  return {
    language: o.language === 'en' ? 'en' : 'ar',
    theme: isTheme(o.theme) ? o.theme : DEFAULT_THEME,
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
    customMaintenanceTypes: normalizeCustomTypes(o.customMaintenanceTypes),
    assistantEnabled: o.assistantEnabled === true ? true : undefined,
    assistantApiKey: o.assistantApiKey ? String(o.assistantApiKey) : undefined,
    assistantBaseUrl: o.assistantBaseUrl ? String(o.assistantBaseUrl) : undefined,
    assistantModel: o.assistantModel ? String(o.assistantModel) : undefined,
    fuelTipText: o.fuelTipText ? String(o.fuelTipText) : undefined,
    fuelTipDay: o.fuelTipDay ? String(o.fuelTipDay) : undefined,
    licenseExpiry: o.licenseExpiry ? String(o.licenseExpiry) : undefined,
    registrationExpiry: o.registrationExpiry
      ? String(o.registrationExpiry)
      : undefined,
  };
}
