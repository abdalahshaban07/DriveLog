import { HISTORY_CONSISTENCY_RATIO } from '../core/config';
import { confidenceFromGaps, roundKm500 } from './maintenance-calc';
import type {
  Confidence,
  HealthStatus,
  Maintenance,
  MeasurementRule,
  PartCondition,
} from './models';

export function conditionToStatus(condition: PartCondition): HealthStatus {
  switch (condition) {
    case 'good':
      return 'good';
    case 'fair':
      return 'inspect';
    case 'poor':
      return 'inspect';
    case 'critical':
      return 'critical';
    default: {
      const _exhaustive: never = condition;
      return _exhaustive;
    }
  }
}

export function measurementThresholdStatus(
  value: number,
  rule: MeasurementRule,
): HealthStatus | null {
  const { direction, attentionValue, criticalValue } = rule;
  if (direction === 'lower-is-worse') {
    if (criticalValue != null && value <= criticalValue) return 'critical';
    if (attentionValue != null && value <= attentionValue) return 'inspect';
    return null;
  }
  if (criticalValue != null && value >= criticalValue) return 'critical';
  if (attentionValue != null && value >= attentionValue) return 'inspect';
  return null;
}

export type WearProjection = {
  kmToAttention: number | null;
  wearPerKm: number;
  confidence: Confidence;
};

/** Brake/tread wear from ≥2 thickness+odo points; project only with user threshold. */
export function projectWear(
  records: readonly Maintenance[],
  measurementType: string,
  attentionValue?: number,
): WearProjection | null {
  const points: { odo: number; value: number }[] = [];
  for (const m of records) {
    for (const meas of m.measurements ?? []) {
      if (meas.type !== measurementType) continue;
      if (!Number.isFinite(meas.value) || !Number.isFinite(m.odometer)) continue;
      points.push({ odo: m.odometer, value: meas.value });
    }
  }
  points.sort((a, b) => a.odo - b.odo);
  if (points.length < 2) return null;

  const rates: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dOdo = points[i]!.odo - points[i - 1]!.odo;
    const dVal = points[i - 1]!.value - points[i]!.value; // thickness loss
    if (dOdo > 0 && dVal > 0) rates.push(dVal / dOdo);
  }
  if (!rates.length) return null;

  const { confidence, gapsUsed } = confidenceFromGaps(
    rates.map((r) => 1 / r), // convert to km-per-unit for consistency check
    HISTORY_CONSISTENCY_RATIO,
  );
  const wearPerKm =
    rates.reduce((s, r) => s + r, 0) / (gapsUsed.length ? rates.length : rates.length);
  const last = points[points.length - 1]!;
  let kmToAttention: number | null = null;
  if (attentionValue != null && wearPerKm > 0 && last.value > attentionValue) {
    kmToAttention = roundKm500((last.value - attentionValue) / wearPerKm);
  }
  return { kmToAttention, wearPerKm, confidence };
}
