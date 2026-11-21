import type { Maintenance } from './models';
import { SYSTEM_ENGINE_OIL_ID, SYSTEM_TIRES_ID } from './part-catalog';

/** Service chronology, not edit time. Correcting an old price never makes it the latest service. */
export function compareServiceRecords(a: Maintenance, b: Maintenance): number {
  return (
    a.date.localeCompare(b.date) ||
    a.odometer - b.odometer ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function resetsServiceDue(row: Maintenance): boolean {
  return (
    row.recordType === 'service' ||
    row.recordType === 'replacement' ||
    (row.recordType == null && row.type !== 'other')
  );
}

function partKey(row: Maintenance): string {
  const legacy =
    row.type === 'oil'
      ? SYSTEM_ENGINE_OIL_ID
      : row.type === 'tires'
        ? SYSTEM_TIRES_ID
        : `legacy:${row.type}:${row.otherLabel?.trim() ?? ''}`;
  return JSON.stringify([row.carId ?? '', row.partDefinitionId || legacy]);
}

/**
 * The latest completed service/replacement retires earlier due dates for that part.
 * Inspection/measurement/repair alone do not reset the service. Explicit follow-ups
 * after that service remain active. This selects records, never mutates the ledger.
 */
export function activeMaintenanceDueRecords(records: readonly Maintenance[]): Maintenance[] {
  const latest = new Map<string, Maintenance>();
  for (const row of records) {
    if (!resetsServiceDue(row)) continue;
    const key = partKey(row);
    const previous = latest.get(key);
    if (!previous || compareServiceRecords(row, previous) > 0) latest.set(key, row);
  }
  return records.filter((row) => {
    const reset = latest.get(partKey(row));
    return (
      !reset ||
      row.id === reset.id ||
      (!resetsServiceDue(row) && compareServiceRecords(row, reset) >= 0)
    );
  });
}
