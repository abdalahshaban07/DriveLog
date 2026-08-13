import type { DueStatus, Maintenance, MaintenanceType } from './models';
import { DUE_SOON_KM } from '../core/config';

export interface SuggestedDue {
  type: MaintenanceType;
  otherLabel?: string;
  dueKm: number;
  intervalKm: number;
  status: DueStatus;
}

/**
 * Infer next due from odometer gaps when the user never set dueKm/dueDate.
 * Display-only — do not write into IndexedDB.
 */
export function suggestMaintenanceDues(
  maintenance: readonly Maintenance[],
  currentOdometer: number,
): SuggestedDue[] {
  const byKey = new Map<string, Maintenance[]>();
  for (const m of maintenance) {
    if (m.dueKm != null || m.dueDate) {
      continue;
    }
    const key = m.type === 'other' ? `other:${(m.otherLabel ?? '').toLowerCase()}` : m.type;
    const list = byKey.get(key) ?? [];
    list.push(m);
    byKey.set(key, list);
  }

  const out: SuggestedDue[] = [];
  for (const list of byKey.values()) {
    if (list.length < 2) {
      continue;
    }
    const sorted = [...list].sort((a, b) => a.odometer - b.odometer);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i]!.odometer - sorted[i - 1]!.odometer;
      if (g > 0) {
        gaps.push(g);
      }
    }
    if (!gaps.length) {
      continue;
    }
    const intervalKm = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    if (intervalKm <= 0) {
      continue;
    }
    const last = sorted[sorted.length - 1]!;
    const dueKm = last.odometer + intervalKm;
    let status: DueStatus = 'future';
    if (currentOdometer >= dueKm) {
      status = 'overdue';
    } else if (dueKm <= currentOdometer + DUE_SOON_KM) {
      status = 'dueSoon';
    }
    out.push({
      type: last.type,
      otherLabel: last.otherLabel,
      dueKm,
      intervalKm,
      status,
    });
  }
  return out.sort((a, b) => a.dueKm - b.dueKm);
}
