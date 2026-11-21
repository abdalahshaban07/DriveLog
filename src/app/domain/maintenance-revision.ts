import type { Maintenance } from './models';

export interface MaintenanceRevision {
  id: string;
  maintenanceId: string;
  carId?: string;
  savedAt: string;
  snapshot: Maintenance;
}

export function normalizeMaintenanceRevision(raw: unknown): MaintenanceRevision {
  const row = raw as MaintenanceRevision;
  if (
    !row?.id ||
    !row.maintenanceId ||
    !row.snapshot ||
    row.snapshot.id !== row.maintenanceId ||
    typeof row.savedAt !== 'string' ||
    row.carId !== row.snapshot.carId
  )
    throw new Error('backup.invalid');
  return {
    id: row.id,
    maintenanceId: row.maintenanceId,
    carId: row.carId,
    savedAt: row.savedAt,
    snapshot: structuredClone(row.snapshot),
  };
}

export function maintenanceChanged(a: Maintenance, b: Maintenance): boolean {
  const stable = (row: Maintenance) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(row)
          .filter(([key, value]) => key !== 'updatedAt' && value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
  return stable(a) !== stable(b);
}
