import { DUE_SOON_DAYS, DUE_SOON_KM } from '../core/config';
import { compareDateOnly, todayDateOnly } from './dues';
import type {
  DateOnly,
  DueStatus,
  Maintenance,
  VehicleDocKind,
  VehicleDocument,
} from './models';

/** Dated rows inside this window, plus anything already overdue. */
export const UPCOMING_DAYS = 90;

export type UpcomingItem = {
  id: string;
  route: '/maintenance' | '/vault';
  status: DueStatus;
  dueDate?: DateOnly;
  dueKm?: number;
  /** No calendar date — sorts after dated rows in the same status. */
  kmOnly: boolean;
  maintenanceId?: string;
  docKind?: VehicleDocKind;
  docLabel?: string;
};

function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function dateStatus(due: DateOnly, today: DateOnly): DueStatus {
  if (compareDateOnly(today, due) >= 0) {
    return 'overdue';
  }
  if (compareDateOnly(due, addDays(today, DUE_SOON_DAYS)) <= 0) {
    return 'dueSoon';
  }
  return 'future';
}

function kmStatus(dueKm: number, odometer: number): DueStatus {
  if (odometer >= dueKm) {
    return 'overdue';
  }
  if (dueKm <= odometer + DUE_SOON_KM) {
    return 'dueSoon';
  }
  return 'future';
}

function worse(a: DueStatus, b: DueStatus): DueStatus {
  const rank: Record<DueStatus, number> = { overdue: 0, dueSoon: 1, future: 2 };
  return rank[a] <= rank[b] ? a : b;
}

function dateInHorizon(due: DateOnly, today: DateOnly): boolean {
  return compareDateOnly(due, addDays(today, UPCOMING_DAYS)) <= 0;
}

function kmInHorizon(dueKm: number, odometer: number): boolean {
  return kmStatus(dueKm, odometer) !== 'future';
}

function statusRank(status: DueStatus): number {
  switch (status) {
    case 'overdue':
      return 0;
    case 'dueSoon':
      return 1;
    case 'future':
      return 2;
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

export function buildUpcoming(input: {
  maintenance: readonly Maintenance[];
  documents: readonly VehicleDocument[];
  odometer: number;
  licenseExpiry?: DateOnly;
  registrationExpiry?: DateOnly;
  today?: DateOnly;
}): UpcomingItem[] {
  const today = input.today ?? todayDateOnly();
  const items: UpcomingItem[] = [];

  for (const row of input.maintenance) {
    const dated = !!row.dueDate && dateInHorizon(row.dueDate, today);
    const byKm = row.dueKm != null && kmInHorizon(row.dueKm, input.odometer);
    if (!dated && !byKm) {
      continue;
    }
    let status: DueStatus = 'future';
    if (row.dueDate) {
      status = dateStatus(row.dueDate, today);
    }
    if (row.dueKm != null) {
      const km = kmStatus(row.dueKm, input.odometer);
      status = row.dueDate ? worse(status, km) : km;
    }
    items.push({
      id: `maint-${row.id}`,
      route: '/maintenance',
      status,
      dueDate: row.dueDate,
      dueKm: row.dueKm,
      kmOnly: !row.dueDate,
      maintenanceId: row.id,
    });
  }

  const kinds = new Set(input.documents.map((doc) => doc.kind));
  for (const doc of input.documents) {
    if (!dateInHorizon(doc.expiryDate, today)) {
      continue;
    }
    items.push({
      id: `doc-${doc.id}`,
      route: '/vault',
      status: dateStatus(doc.expiryDate, today),
      dueDate: doc.expiryDate,
      kmOnly: false,
      docKind: doc.kind,
      docLabel: doc.label,
    });
  }

  const carDocs: { kind: 'license' | 'registration'; expiry?: DateOnly }[] = [
    { kind: 'license', expiry: input.licenseExpiry },
    { kind: 'registration', expiry: input.registrationExpiry },
  ];
  for (const paper of carDocs) {
    if (!paper.expiry || kinds.has(paper.kind) || !dateInHorizon(paper.expiry, today)) {
      continue;
    }
    items.push({
      id: `car-${paper.kind}`,
      route: '/vault',
      status: dateStatus(paper.expiry, today),
      dueDate: paper.expiry,
      kmOnly: false,
      docKind: paper.kind,
    });
  }

  return items.sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) {
      return rank;
    }
    if (a.kmOnly !== b.kmOnly) {
      return a.kmOnly ? 1 : -1;
    }
    if (a.dueDate && b.dueDate) {
      const byDate = compareDateOnly(a.dueDate, b.dueDate);
      if (byDate !== 0) {
        return byDate;
      }
    }
    if (a.dueKm != null && b.dueKm != null && a.dueKm !== b.dueKm) {
      return a.dueKm - b.dueKm;
    }
    return a.id.localeCompare(b.id);
  });
}
