import { Injectable, computed, signal } from '@angular/core';
import {
  BACKUP_VERSION,
  DB_NAME,
  DB_VERSION,
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  DEFAULT_UNIT_SYSTEM,
} from '../core/config';
import { knownOdometer } from '../domain/economy';
import {
  addCustomMaintenanceType,
  maintenanceDetailFields,
  normalizeCustomTypes,
  type AddCustomTypeResult,
} from '../domain/maintenance-fields';
import {
  MAINTENANCE_TYPES,
  THEMES,
  type BackupFile,
  type Car,
  type FillUp,
  type Maintenance,
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

@Injectable({ providedIn: 'root' })
export class Db {
  private readonly _ready = signal(false);
  private readonly _cars = signal<Car[]>([]);
  private readonly _car = signal<Car | null>(null);
  private readonly _settings = signal<Settings>(defaultSettings());
  private readonly _fillUpsAll = signal<FillUp[]>([]);
  private readonly _maintenanceAll = signal<Maintenance[]>([]);
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
  readonly error = this._error.asReadonly();
  readonly savedFlash = this._savedFlash.asReadonly();

  readonly hasCar = computed(() => this._car() !== null);

  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<void> {
    try {
      const db = await this.open();
      const [cars, settings, fillUps, maintenance] = await Promise.all([
        this.getAll<Car>(db, 'car'),
        this.getAll<Settings & { id?: string }>(db, 'settings').then(
          (rows) => rows[0] ?? defaultSettings(),
        ),
        this.getAll<FillUp>(db, 'fillUps'),
        this.getAll<Maintenance>(db, 'maintenance'),
      ]);
      const normalizedSettings = normalizeSettings(settings);
      const active =
        cars.find((c) => c.id === normalizedSettings.activeCarId) ?? cars[0] ?? null;
      this._cars.set(cars);
      this._car.set(active);
      this._settings.set(normalizedSettings);
      this._fillUpsAll.set(fillUps);
      this._maintenanceAll.set(maintenance.map(normalizeMaintenance));
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
        if (!db.objectStoreNames.contains('car')) {
          db.createObjectStore('car', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('fillUps')) {
          db.createObjectStore('fillUps', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('maintenance')) {
          db.createObjectStore('maintenance', { keyPath: 'id' });
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

  private clearStore(store: string): Promise<void> {
    return this.open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  private async replaceAll(data: {
    cars: Car[];
    car: Car | null;
    settings: Settings;
    fillUps: FillUp[];
    maintenance: Maintenance[];
  }): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['car', 'settings', 'fillUps', 'maintenance'],
        'readwrite',
      );
      tx.objectStore('car').clear();
      tx.objectStore('settings').clear();
      tx.objectStore('fillUps').clear();
      tx.objectStore('maintenance').clear();
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
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this._cars.set(data.cars);
    this._car.set(data.car);
    this._settings.set(data.settings);
    this._fillUpsAll.set(data.fillUps);
    this._maintenanceAll.set(data.maintenance);
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
      void this.put('car', updated);
    }
  }

  async createCar(
    nickname: string,
    initialOdometer: number,
    extras?: Partial<
      Pick<Car, 'vin' | 'year' | 'make' | 'model' | 'recallCount'>
    >,
  ): Promise<void> {
    const ts = nowIso();
    const car: Car = {
      id: crypto.randomUUID(),
      nickname: nickname.trim(),
      initialOdometer,
      currentOdometer: initialOdometer,
      ...carVinFields(extras),
      createdAt: ts,
      updatedAt: ts,
    };
    await this.put('car', car);
    const settings: Settings = { ...this._settings(), activeCarId: car.id };
    await this.put('settings', { id: 'settings', ...settings });
    this._cars.set([...this._cars(), car]);
    this._car.set(car);
    this._settings.set(settings);
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

  async updateCar(
    patch: Partial<
      Pick<Car, 'nickname' | 'vin' | 'year' | 'make' | 'model' | 'recallCount'>
    >,
  ): Promise<void> {
    const car = this._car();
    if (!car) {
      throw new Error('persist.noCar');
    }
    const updated: Car = {
      ...car,
      ...patch,
      ...('vin' in patch ||
      'year' in patch ||
      'make' in patch ||
      'model' in patch ||
      'recallCount' in patch
        ? carVinFields({ ...car, ...patch })
        : {}),
      nickname: patch.nickname != null ? patch.nickname.trim() : car.nickname,
      updatedAt: nowIso(),
    };
    await this.put('car', updated);
    this._car.set(updated);
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

  exportBackup(): BackupFile {
    return {
      version: BACKUP_VERSION,
      exportedAt: nowIso(),
      car: this._car(),
      cars: this._cars(),
      settings: this._settings(),
      fillUps: this._fillUpsAll(),
      maintenance: this._maintenanceAll(),
    };
  }

  validateBackup(raw: unknown): BackupFile {
    if (!raw || typeof raw !== 'object') {
      throw new Error('backup.invalid');
    }
    const obj = raw as Record<string, unknown>;
    // ponytail: accept v1 backups; v2 adds optional fill fields only
    if (obj['version'] !== 1 && obj['version'] !== BACKUP_VERSION) {
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
    const cars = carsRaw?.length ? carsRaw.map(normalizeCar) : obj['car'] ? [normalizeCar(obj['car'])] : [];
    const car =
      cars.find((c) => c.id === settings.activeCarId) ?? cars[0] ?? null;
    if (car && !settings.activeCarId) {
      settings.activeCarId = car.id;
    }
    return {
      version: BACKUP_VERSION,
      exportedAt: String(obj['exportedAt'] ?? nowIso()),
      car,
      cars: cars.length ? cars : undefined,
      settings,
      fillUps,
      maintenance,
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
    });
  }

  /** Wipe cars, fill-ups, maintenance, and settings. */
  async wipeAll(): Promise<void> {
    await this.replaceAll({
      cars: [],
      car: null,
      settings: defaultSettings(),
      fillUps: [],
      maintenance: [],
    });
  }

  /**
   * Delete one car and its fill-ups/maintenance.
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
    const fillUps = this._fillUpsAll().filter((f) => !drop(f));
    const maintenance = this._maintenanceAll().filter((m) => !drop(m));
    const next = remaining.find((c) => c.id === this._settings().activeCarId) ?? remaining[0];
    const settings: Settings = {
      ...this._settings(),
      activeCarId: next.id,
    };

    await this.deleteKey('car', id);
    await Promise.all([
      ...droppedFill.map((f) => this.deleteKey('fillUps', f.id)),
      ...droppedMaint.map((m) => this.deleteKey('maintenance', m.id)),
    ]);
    await this.put('settings', { id: 'settings', ...settings });

    this._cars.set(remaining);
    this._car.set(next);
    this._settings.set(settings);
    this._fillUpsAll.set(fillUps);
    this._maintenanceAll.set(maintenance);
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
    ...carVinFields(o),
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
    licenseExpiry: o.licenseExpiry ? String(o.licenseExpiry) : undefined,
    registrationExpiry: o.registrationExpiry
      ? String(o.registrationExpiry)
      : undefined,
    customMaintenanceTypes: normalizeCustomTypes(o.customMaintenanceTypes),
  };
}
