import type { Maintenance } from './models';

export type DataQualityTip = {
  id: string;
  kind:
    | 'missing_cost'
    | 'missing_currency'
    | 'odometer_rollback'
    | 'thin_history'
    | 'near_duplicate'
    | 'missing_part';
  maintenanceId?: string;
  messageKey: string;
};

export function buildDataQualityTips(
  maintenance: readonly Maintenance[],
  carId: string,
): DataQualityTip[] {
  const tips: DataQualityTip[] = [];
  const rows = maintenance.filter((m) => m.carId === carId || m.carId == null);

  for (const m of rows) {
    if (m.cost == null) {
      tips.push({
        id: `missing-cost-${m.id}`,
        kind: 'missing_cost',
        maintenanceId: m.id,
        messageKey: 'health.dq.missingCost',
      });
    }
    if (m.cost != null && !m.currency) {
      tips.push({
        id: `missing-currency-${m.id}`,
        kind: 'missing_currency',
        maintenanceId: m.id,
        messageKey: 'health.dq.missingCurrency',
      });
    }
    if (m.odometerRollbackAcknowledged) {
      tips.push({
        id: `rollback-${m.id}`,
        kind: 'odometer_rollback',
        maintenanceId: m.id,
        messageKey: 'health.dq.odometerRollback',
      });
    }
    if (!m.partDefinitionId) {
      tips.push({
        id: `missing-part-${m.id}`,
        kind: 'missing_part',
        maintenanceId: m.id,
        messageKey: 'health.dq.missingPart',
      });
    }
  }

  const byPart = new Map<string, Maintenance[]>();
  for (const m of rows) {
    if (!m.partDefinitionId) continue;
    const list = byPart.get(m.partDefinitionId) ?? [];
    list.push(m);
    byPart.set(m.partDefinitionId, list);
  }
  for (const [partId, list] of byPart) {
    if (list.length === 1) {
      tips.push({
        id: `thin-${partId}`,
        kind: 'thin_history',
        messageKey: 'health.dq.thinHistory',
      });
    }
  }

  return tips;
}

/** Exact duplicate key (61A). */
export function maintenanceDuplicateKey(m: {
  carId?: string;
  partDefinitionId?: string;
  date: string;
  odometer: number;
  recordType?: string;
  cost?: number;
  currency?: string;
}): string {
  const costKey = m.cost == null ? '∅' : String(m.cost);
  return [
    m.carId ?? '',
    m.partDefinitionId ?? '',
    m.date,
    m.odometer,
    m.recordType ?? '',
    costKey,
    m.currency ?? '',
  ].join('|');
}

export function findExactDuplicate(
  rows: readonly Maintenance[],
  candidate: Parameters<typeof maintenanceDuplicateKey>[0],
  excludeId?: string,
): Maintenance | undefined {
  const key = maintenanceDuplicateKey(candidate);
  return rows.find(
    (m) => m.id !== excludeId && maintenanceDuplicateKey(m) === key,
  );
}
