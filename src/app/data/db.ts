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
  private readonly _car = signal<Car | null>(null);
  private readonly _settings = signal<Settings>(defaultSettings());
  private readonly _fillUps = signal<FillUp[]>([]);
  private readonly _maintenance = signal<Maintenance[]>([]);
  private readonly _error = signal<string | null>(null);
  private readonly _savedFlash = signal(false);

  readonly ready = this._ready.asReadonly();
  readonly car = this._car.asReadonly();
  readonly settings = this._settings.asReadonly();
  readonly fillUps = this._fillUps.asReadonly();
  readonly maintenance = this._maintenance.asReadonly();
  readonly error = this._error.asReadonly();
  readonly savedFlash = this._savedFlash.asReadonly();

  readonly hasCar = computed(() => this._car() !== null);

  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<void> {
    try {
      const db = await this.open();
      const [car, settings, fillUps, maintenance] = await Promise.all([
        this.getAll<Car>(db, 'car').then((rows) => rows[0] ?? null),
        this.getAll<Settings & { id?: string }>(db, 'settings').then(
          (rows) => rows[0] ?? defaultSettings(),
        ),
        this.getAll<FillUp>(db, 'fillUps'),
        this.getAll<Maintenance>(db, 'maintenance'),
      ]);
      this._car.set(car);
      this._settings.set(normalizeSettings(settings));
      this._fillUps.set(fillUps);
      this._maintenance.set(maintenance.map(normalizeMaintenance));
      if (car) {
        this.recalcOdometer();
      }
      this._ready.set(true);
    } catch (e) {
      this._error.set('persist.initFailed');
      this._ready.set(true);
      console.error(e);
    }
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
      if (data.car) {
        tx.objectStore('car').put(data.car);
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
    this._car.set(data.car);
    this._settings.set(data.settings);
    this._fillUps.set(data.fillUps);
    this._maintenance.set(data.maintenance);
    if (data.car) {
      this.recalcOdometer();
    }
  }

  recalcOdometer(): void {
    const car = this._car();
    if (!car) {
      return;
    }
    const next = knownOdometer(car.initialOdometer, this._fillUps(), this._maintenance());
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
    const settings = this._settings();
    await this.put('settings', { id: 'settings', ...settings });
    this._car.set(car);
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
      ? this._fillUps().find((f) => f.id === input.id)
      : undefined;
    const row: FillUp = {
      id: existing?.id ?? crypto.randomUUID(),
      odometer: input.odometer,
      liters: input.liters,
      cost: input.cost,
      fuelGrade: input.fuelGrade,
      unitPrice: input.unitPrice,
      tankFull: input.tankFull,
      note: input.note?.trim() || undefined,
      date: input.date,
      lat: input.lat,
      lon: input.lon,
      tempC: input.tempC,
      weatherCode: input.weatherCode,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.put('fillUps', row);
    const list = this._fillUps().filter((f) => f.id !== row.id).concat(row);
    this._fillUps.set(list);
    this.recalcOdometer();
    this.flashSaved();
  }

  async deleteFillUp(id: string): Promise<void> {
    await this.deleteKey('fillUps', id);
    this._fillUps.set(this._fillUps().filter((f) => f.id !== id));
    this.recalcOdometer();
  }

  async saveMaintenance(
    input: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const ts = nowIso();
    const existing = input.id
      ? this._maintenance().find((m) => m.id === input.id)
      : undefined;
    const row: Maintenance = {
      id: existing?.id ?? crypto.randomUUID(),
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
    const list = this._maintenance().filter((m) => m.id !== row.id).concat(row);
    this._maintenance.set(list);
    this.recalcOdometer();
    this.flashSaved();
  }

  async deleteMaintenance(id: string): Promise<void> {
    await this.deleteKey('maintenance', id);
    this._maintenance.set(this._maintenance().filter((m) => m.id !== id));
    this.recalcOdometer();
  }

  exportBackup(): BackupFile {
    return {
      version: BACKUP_VERSION,
      exportedAt: nowIso(),
      car: this._car(),
      settings: this._settings(),
      fillUps: this._fillUps(),
      maintenance: this._maintenance(),
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
    const car = obj['car'] ? normalizeCar(obj['car']) : null;
    return {
      version: BACKUP_VERSION,
      exportedAt: String(obj['exportedAt'] ?? nowIso()),
      car,
      settings,
      fillUps,
      maintenance,
    };
  }

  async importReplace(backup: BackupFile): Promise<void> {
    await this.replaceAll({
      car: backup.car,
      settings: backup.settings,
      fillUps: backup.fillUps,
      maintenance: backup.maintenance,
    });
  }

  async importMerge(backup: BackupFile): Promise<void> {
    const fillMap = new Map(this._fillUps().map((f) => [f.id, f]));
    for (const f of backup.fillUps) {
      fillMap.set(f.id, f);
    }
    const maintMap = new Map(this._maintenance().map((m) => [m.id, m]));
    for (const m of backup.maintenance) {
      maintMap.set(m.id, m);
    }
    const car = backup.car ?? this._car();
    const prevTypes = this._settings().customMaintenanceTypes ?? [];
    const incomingTypes = backup.settings.customMaintenanceTypes ?? [];
    const settings = {
      ...this._settings(),
      ...backup.settings,
      unitSystem: DEFAULT_UNIT_SYSTEM,
      customMaintenanceTypes: normalizeCustomTypes([...prevTypes, ...incomingTypes]),
    };
    await this.replaceAll({
      car,
      settings,
      fillUps: [...fillMap.values()],
      maintenance: [...maintMap.values()],
    });
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
