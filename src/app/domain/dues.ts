import { DUE_SOON_DAYS, DUE_SOON_KM } from '../core/config';
import type {
  Car,
  DateOnly,
  DueItem,
  DueStatus,
  Maintenance,
  Settings,
} from './models';

function parseDateOnly(value: DateOnly): { y: number; m: number; d: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Local calendar day comparison without UTC shift. */
export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  const A = parseDateOnly(a);
  const B = parseDateOnly(b);
  if (A.y !== B.y) {
    return A.y - B.y;
  }
  if (A.m !== B.m) {
    return A.m - B.m;
  }
  return A.d - B.d;
}

export function todayDateOnly(now: Date = new Date()): DateOnly {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: DateOnly, days: number): DateOnly {
  const { y, m, d } = parseDateOnly(date);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayDateOnly(dt);
}

function statusForDate(
  dueDate: DateOnly,
  today: DateOnly,
): DueStatus {
  if (compareDateOnly(today, dueDate) >= 0) {
    return 'overdue';
  }
  const soonLimit = addDays(today, DUE_SOON_DAYS);
  if (compareDateOnly(dueDate, soonLimit) <= 0) {
    return 'dueSoon';
  }
  return 'future';
}

function statusForKm(dueKm: number, currentOdometer: number): DueStatus {
  if (currentOdometer >= dueKm) {
    return 'overdue';
  }
  if (dueKm <= currentOdometer + DUE_SOON_KM) {
    return 'dueSoon';
  }
  return 'future';
}

function worseStatus(a: DueStatus, b: DueStatus): DueStatus {
  const rank: Record<DueStatus, number> = { overdue: 0, dueSoon: 1, future: 2 };
  return rank[a] <= rank[b] ? a : b;
}

function buildFromDate(
  id: string,
  source: DueItem['source'],
  labelKey: string,
  dueDate: DateOnly,
  today: DateOnly,
): DueItem {
  return {
    id,
    source,
    labelKey,
    status: statusForDate(dueDate, today),
    dueDate,
  };
}

export function buildDueItems(
  settings: Settings,
  maintenance: readonly Maintenance[],
  currentOdometer: number,
  today: DateOnly = todayDateOnly(),
  car?: Pick<Car, 'licenseExpiry' | 'registrationExpiry'> | null,
): DueItem[] {
  const items: DueItem[] = [];

  // ponytail: missing flag = off (normalizeSettings). Maintenance dues stay independent.
  // License/registration live on Car (v4); Settings fields are legacy import only.
  if (settings.remindersEnabled) {
    const license = car?.licenseExpiry ?? settings.licenseExpiry;
    const registration = car?.registrationExpiry ?? settings.registrationExpiry;
    if (license) {
      items.push(buildFromDate('license', 'license', 'due.license', license, today));
    }
    if (registration) {
      items.push(
        buildFromDate('registration', 'registration', 'due.registration', registration, today),
      );
    }
  }

  for (const m of maintenance) {
    if (m.dueKm == null && !m.dueDate) {
      continue;
    }
    let status: DueStatus | null = null;
    if (m.dueKm != null) {
      status = statusForKm(m.dueKm, currentOdometer);
    }
    if (m.dueDate) {
      const dateStatus = statusForDate(m.dueDate, today);
      status = status ? worseStatus(status, dateStatus) : dateStatus;
    }
    if (!status) {
      continue;
    }
    items.push({
      id: `maint-${m.id}`,
      source: 'maintenance',
      labelKey: `maintenance.type.${m.type}`,
      labelParams: m.otherLabel ? { name: m.otherLabel } : undefined,
      status,
      dueKm: m.dueKm,
      dueDate: m.dueDate,
      maintenanceId: m.id,
    });
  }

  return items;
}

export function nextDueItem(items: readonly DueItem[]): DueItem | null {
  const overdue = items.filter((i) => i.status === 'overdue');
  if (overdue.length) {
    return pickEarliest(overdue);
  }
  const soon = items.filter((i) => i.status === 'dueSoon');
  if (soon.length) {
    return pickEarliest(soon);
  }
  const future = items.filter((i) => i.status === 'future');
  if (future.length) {
    return pickEarliest(future);
  }
  return null;
}

function pickEarliest(items: readonly DueItem[]): DueItem {
  return [...items].sort((a, b) => {
    if (a.dueDate && b.dueDate) {
      const c = compareDateOnly(a.dueDate, b.dueDate);
      if (c !== 0) {
        return c;
      }
    }
    if (a.dueDate && !b.dueDate) {
      return -1;
    }
    if (!a.dueDate && b.dueDate) {
      return 1;
    }
    if (a.dueKm != null && b.dueKm != null) {
      return a.dueKm - b.dueKm;
    }
    return a.id.localeCompare(b.id);
  })[0]!;
}
