import {
  ROUTINE_CHECK_PART_ID,
  SYSTEM_ENGINE_OIL_ID,
  SYSTEM_TIRES_ID,
} from './part-catalog';
import type {
  Maintenance,
  MaintenanceMilestone,
  MaintenanceRecordType,
  PartDefinition,
  PartOverride,
} from './models';

export type HealthMigrationResult = {
  maintenance: Maintenance[];
  parts: PartDefinition[];
  partOverrides: PartOverride[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function overrideId(carId: string, partDefinitionId: string): string {
  return `${carId}:${partDefinitionId}`;
}

function customPart(
  carId: string,
  name: string,
  ts: string,
): PartDefinition {
  return {
    id: crypto.randomUUID(),
    carId,
    name,
    category: 'OTHER',
    source: 'custom',
    trackingMode: 'history',
    active: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

function legacyRecordType(type: Maintenance['type']): MaintenanceRecordType {
  return type === 'other' ? 'repair' : 'service';
}

function resolvePartForRow(
  row: Maintenance,
  carId: string,
  ts: string,
  customs: Map<string, PartDefinition>,
): { partId: string; part?: PartDefinition } {
  if (row.type === 'oil') {
    return { partId: SYSTEM_ENGINE_OIL_ID };
  }
  if (row.type === 'tires') {
    return { partId: SYSTEM_TIRES_ID };
  }
  const key =
    row.type === 'filter'
      ? 'maintenance.type.filter'
      : row.type === 'brakes'
        ? 'maintenance.type.brakes'
        : row.otherLabel?.trim()
          ? row.otherLabel.trim()
          : 'maintenance.type.other';
  const mapKey = `${carId}::${key}`;
  let part = customs.get(mapKey);
  if (!part) {
    part = customPart(carId, key, ts);
    customs.set(mapKey, part);
  }
  return { partId: part.id, part };
}

/**
 * DB v5 migration: link maintenance to PartDefinition, create custom parts,
 * activate used parts, seed routine-check lastRoutineCheckKm from milestones (93C/102B).
 */
export function migrateHealthV5(
  maintenance: readonly Maintenance[],
  milestones: readonly MaintenanceMilestone[],
  currency: string,
  existingParts: readonly PartDefinition[] = [],
  existingOverrides: readonly PartOverride[] = [],
): HealthMigrationResult {
  const ts = nowIso();
  const customs = new Map<string, PartDefinition>();
  for (const p of existingParts) {
    if (p.source === 'custom' && p.carId && p.name) {
      customs.set(`${p.carId}::${p.name}`, p);
    }
  }

  const activated = new Set<string>();
  const nextMaint: Maintenance[] = [];

  for (const row of maintenance) {
    const carId = row.carId ?? '';
    if (!carId) {
      nextMaint.push({
        ...row,
        currency: row.currency ?? currency,
        cost: row.cost == null || !Number.isFinite(Number(row.cost)) ? undefined : Number(row.cost),
      });
      continue;
    }
    if (row.partDefinitionId) {
      activated.add(`${carId}:${row.partDefinitionId}`);
      nextMaint.push({
        ...row,
        currency: row.currency ?? currency,
        cost: row.cost == null || !Number.isFinite(Number(row.cost)) ? undefined : Number(row.cost),
        recordType: row.recordType ?? legacyRecordType(row.type),
      });
      continue;
    }
    const { partId, part } = resolvePartForRow(row, carId, ts, customs);
    if (part) {
      // already in customs map
    }
    activated.add(`${carId}:${partId}`);
    nextMaint.push({
      ...row,
      partDefinitionId: partId,
      recordType: row.recordType ?? legacyRecordType(row.type),
      currency: row.currency ?? currency,
      cost: row.cost == null || !Number.isFinite(Number(row.cost)) ? undefined : Number(row.cost),
    });
  }

  const parts = [...customs.values()];
  const overrideMap = new Map(existingOverrides.map((o) => [o.id, { ...o }]));

  for (const key of activated) {
    const [carId, partDefinitionId] = key.split(':') as [string, string];
    if (!carId || !partDefinitionId) continue;
    if (partDefinitionId === ROUTINE_CHECK_PART_ID) continue;
    const id = overrideId(carId, partDefinitionId);
    const prev = overrideMap.get(id);
    overrideMap.set(id, {
      id,
      carId,
      partDefinitionId,
      ...prev,
      active: true,
      updatedAt: ts,
    });
  }

  // Seed lastRoutineCheckKm from milestones (max lastDoneKm per car).
  const maxDoneByCar = new Map<string, number>();
  for (const m of milestones) {
    for (const t of m.tasks) {
      if (t.lastDoneKm == null || !Number.isFinite(t.lastDoneKm)) continue;
      const prev = maxDoneByCar.get(m.carId) ?? 0;
      if (t.lastDoneKm > prev) {
        maxDoneByCar.set(m.carId, t.lastDoneKm);
      }
    }
  }
  for (const [carId, km] of maxDoneByCar) {
    const id = overrideId(carId, ROUTINE_CHECK_PART_ID);
    const prev = overrideMap.get(id);
    overrideMap.set(id, {
      id,
      carId,
      partDefinitionId: ROUTINE_CHECK_PART_ID,
      ...prev,
      lastRoutineCheckKm: prev?.lastRoutineCheckKm ?? km,
      updatedAt: ts,
    });
  }

  return {
    maintenance: nextMaint,
    parts,
    partOverrides: [...overrideMap.values()],
  };
}

/** Deterministic legacy type map for new writes (5B). */
export function legacyTypeForPart(
  part: PartDefinition,
): { type: Maintenance['type']; otherLabel?: string } {
  if (part.id === SYSTEM_ENGINE_OIL_ID || part.labelKey === 'parts.engineOil') {
    return { type: 'oil' };
  }
  if (part.id === SYSTEM_TIRES_ID || part.labelKey === 'parts.tires') {
    return { type: 'tires' };
  }
  if (part.name === 'maintenance.type.filter') {
    return { type: 'filter' };
  }
  if (part.name === 'maintenance.type.brakes') {
    return { type: 'brakes' };
  }
  const label = part.name ?? part.labelKey ?? 'other';
  return { type: 'other', otherLabel: label };
}
