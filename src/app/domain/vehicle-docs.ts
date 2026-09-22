import { compareDateOnly, todayDateOnly } from './dues';
import type { Car, DateOnly, VehicleDocKind, VehicleDocument } from './models';

/** Nudge windows (days before expiry). */
export const DOC_NUDGE_DAYS = [30, 7, 1] as const;

export type DocUrgency = 'expired' | 'd1' | 'd7' | 'd30' | 'ok';

export function daysUntilExpiry(expiry: DateOnly, today: DateOnly = todayDateOnly()): number {
  const a = expiry.split('-').map(Number);
  const b = today.split('-').map(Number);
  const exp = Date.UTC(a[0]!, a[1]! - 1, a[2]!);
  const now = Date.UTC(b[0]!, b[1]! - 1, b[2]!);
  return Math.round((exp - now) / 86_400_000);
}

export function docUrgency(expiry: DateOnly, today: DateOnly = todayDateOnly()): DocUrgency {
  const days = daysUntilExpiry(expiry, today);
  if (days < 0) {
    return 'expired';
  }
  if (days <= 1) {
    return 'd1';
  }
  if (days <= 7) {
    return 'd7';
  }
  if (days <= 30) {
    return 'd30';
  }
  return 'ok';
}

const URGENCY_RANK: Record<DocUrgency, number> = {
  expired: 0,
  d1: 1,
  d7: 2,
  d30: 3,
  ok: 4,
};

/** Soonest / most urgent first. */
export function sortDocsByUrgency(
  docs: readonly VehicleDocument[],
  today: DateOnly = todayDateOnly(),
): VehicleDocument[] {
  return [...docs].sort((a, b) => {
    const ua = URGENCY_RANK[docUrgency(a.expiryDate, today)];
    const ub = URGENCY_RANK[docUrgency(b.expiryDate, today)];
    if (ua !== ub) {
      return ua - ub;
    }
    return compareDateOnly(a.expiryDate, b.expiryDate);
  });
}

export function nextExpiringDoc(
  docs: readonly VehicleDocument[],
  today: DateOnly = todayDateOnly(),
): VehicleDocument | null {
  const sorted = sortDocsByUrgency(docs, today);
  return sorted[0] ?? null;
}

export function hasExpiredDocs(
  docs: readonly VehicleDocument[],
  today: DateOnly = todayDateOnly(),
): boolean {
  return docs.some((d) => docUrgency(d.expiryDate, today) === 'expired');
}

/** Seed vault rows from legacy Car license/registration when missing. */
export function migrateCarExpiryToVault(
  car: Pick<Car, 'id' | 'licenseExpiry' | 'registrationExpiry'>,
  existing: readonly VehicleDocument[],
  nowIso: string,
): VehicleDocument[] {
  const out: VehicleDocument[] = [];
  const hasKind = (kind: VehicleDocKind) =>
    existing.some((d) => d.carId === car.id && d.kind === kind) ||
    out.some((d) => d.kind === kind);

  if (car.licenseExpiry && !hasKind('license')) {
    out.push({
      id: crypto.randomUUID(),
      carId: car.id,
      kind: 'license',
      expiryDate: car.licenseExpiry,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  if (car.registrationExpiry && !hasKind('registration')) {
    out.push({
      id: crypto.randomUUID(),
      carId: car.id,
      kind: 'registration',
      expiryDate: car.registrationExpiry,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return out;
}

export function vaultExpiryForKind(
  docs: readonly VehicleDocument[],
  kind: 'license' | 'registration',
): DateOnly | undefined {
  const matches = docs.filter((d) => d.kind === kind);
  if (!matches.length) {
    return undefined;
  }
  return [...matches].sort((a, b) => compareDateOnly(a.expiryDate, b.expiryDate))[0]!
    .expiryDate;
}
