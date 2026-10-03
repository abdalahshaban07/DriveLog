import { daysUntil } from './expense-period';
import type { DateOnly } from './models';

export interface OperatingSnapshot {
  daysSinceFill: number;
  kmSinceFill: number | null;
  rangeKm: number | null;
  place: string | null;
}

/** Days, distance, and tank range since the latest fill. Range is tank ÷ L/100 km. */
export function operatingSnapshot(input: {
  today: DateOnly;
  fillDate: DateOnly;
  fillOdometer: number;
  currentOdometer: number;
  place?: string;
  tankLiters?: number;
  litersPer100?: number | null;
}): OperatingSnapshot {
  const days = daysUntil(input.today, input.fillDate);
  const km = input.currentOdometer - input.fillOdometer;
  const liters = input.litersPer100;
  const tank = input.tankLiters;
  const range =
    liters != null && liters > 0 && tank != null && tank > 0
      ? Math.round((tank / liters) * 100)
      : null;
  const place = input.place?.trim() ?? '';
  return {
    daysSinceFill: Math.max(0, days),
    kmSinceFill: km >= 0 ? km : null,
    rangeKm: range,
    place: place || null,
  };
}
