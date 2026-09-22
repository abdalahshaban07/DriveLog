import type { ChargeSession, FillUp } from './models';

export type EnergyKind = 'fuel' | 'charge';

export type EnergyHistoryRow =
  | { kind: 'fuel'; row: FillUp }
  | { kind: 'charge'; row: ChargeSession };

/** Merge fill-ups and charge sessions, newest first. */
export function mergeEnergyHistory(
  fills: readonly FillUp[],
  charges: readonly ChargeSession[],
  filter: EnergyKind | 'all' = 'all',
): EnergyHistoryRow[] {
  const out: EnergyHistoryRow[] = [];
  if (filter === 'all' || filter === 'fuel') {
    for (const row of fills) {
      out.push({ kind: 'fuel', row });
    }
  }
  if (filter === 'all' || filter === 'charge') {
    for (const row of charges) {
      out.push({ kind: 'charge', row });
    }
  }
  return out.sort((a, b) => {
    const d = b.row.date.localeCompare(a.row.date);
    if (d !== 0) {
      return d;
    }
    return b.row.createdAt.localeCompare(a.row.createdAt);
  });
}

export function energyRowCost(item: EnergyHistoryRow): number {
  return item.row.cost;
}
