import { HISTORY_CONSISTENCY_RATIO } from '../core/config';
import { confidenceFromGaps, median } from './maintenance-calc';
import type { Confidence, Maintenance, MaintenanceRecordType } from './models';

const RESET_TYPES: readonly MaintenanceRecordType[] = ['replacement', 'service'];

export type HistoryIntervalEstimate = {
  intervalKm: number;
  confidence: Confidence;
  sampleCount: number;
  excludedGaps: number[];
  source: 'USER_HISTORY';
};

/** Learn km interval from replacement/service odometer gaps (68A). */
export function estimateIntervalFromHistory(
  records: readonly Maintenance[],
  partDefinitionId: string,
): HistoryIntervalEstimate | null {
  const rows = records
    .filter(
      (m) =>
        m.partDefinitionId === partDefinitionId &&
        m.recordType &&
        RESET_TYPES.includes(m.recordType) &&
        Number.isFinite(m.odometer),
    )
    .slice()
    .sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));

  if (rows.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const g = rows[i]!.odometer - rows[i - 1]!.odometer;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return null;

  const { confidence, gapsUsed, excluded } = confidenceFromGaps(
    gaps,
    HISTORY_CONSISTENCY_RATIO,
  );
  if (!gapsUsed.length) return null;
  const intervalKm = Math.round(median(gapsUsed));
  if (!(intervalKm > 0)) return null;
  return {
    intervalKm,
    confidence,
    sampleCount: gapsUsed.length,
    excludedGaps: excluded,
    source: 'USER_HISTORY',
  };
}

export function lastResetRecord(
  records: readonly Maintenance[],
  partDefinitionId: string,
): Maintenance | null {
  const rows = records
    .filter(
      (m) =>
        m.partDefinitionId === partDefinitionId &&
        m.recordType &&
        RESET_TYPES.includes(m.recordType),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);
  return rows[0] ?? null;
}
