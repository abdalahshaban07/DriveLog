import type { Confidence, DateOnly, FillUp, Maintenance, Breakdown, Car } from './models';
import type { HealthItem } from './vehicle-health';
import type { CostEstimate } from './budget-engine';

export type ForecastBucket = {
  months: 3 | 6 | 12;
  known: number;
  estimated: number;
  unknownCount: number;
  noteKey?: string;
};

function daysBetween(a: DateOnly, b: DateOnly): number {
  const ms =
    Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
  return ms / 86_400_000;
}

/** Mileage rate from odometer samples over latest 6 months (76A). */
export function estimateMonthlyKm(input: {
  car: Car;
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  breakdowns: readonly Breakdown[];
  today: DateOnly;
}): number | null {
  type Sample = { date: DateOnly; odo: number };
  const samples: Sample[] = [];
  if (input.car.createdAt) {
    samples.push({
      date: input.car.createdAt.slice(0, 10),
      odo: input.car.initialOdometer,
    });
  }
  for (const f of input.fills) {
    if (!f.carId || f.carId === input.car.id) {
      samples.push({ date: f.date, odo: f.odometer });
    }
  }
  for (const m of input.maintenance) {
    if (!m.carId || m.carId === input.car.id) {
      samples.push({ date: m.date, odo: m.odometer });
    }
  }
  for (const b of input.breakdowns) {
    if (b.carId === input.car.id) {
      samples.push({ date: b.date, odo: b.odometer });
    }
  }
  samples.sort((a, b) => a.date.localeCompare(b.date) || a.odo - b.odo);

  const cutoff = shiftMonths(input.today, -6);
  const window = samples.filter((s) => s.date >= cutoff);
  if (window.length < 2) return null;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  const daySpan = daysBetween(first.date, last.date);
  if (daySpan < 30) return null;
  const km = last.odo - first.odo;
  if (!(km > 0)) return null;
  return (km / daySpan) * 30.4375;
}

function shiftMonths(date: DateOnly, delta: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1 + delta, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function buildForecasts(input: {
  items: readonly HealthItem[];
  today: DateOnly;
  monthlyKm: number | null;
  estimateCost: (item: HealthItem) => CostEstimate;
}): ForecastBucket[] {
  return ([3, 6, 12] as const).map((months) => {
    let known = 0;
    let estimated = 0;
    let unknownCount = 0;
    let noteKey: string | undefined;
    const horizonDays = months * 30.4375;

    for (const item of input.items) {
      if (item.status === 'good' || item.status === 'unknown') continue;
      let within = false;
      if (item.dueDate) {
        const days = daysBetween(input.today, item.dueDate);
        within = days >= 0 && days <= horizonDays;
      } else if (item.remainingKm != null) {
        if (input.monthlyKm == null) {
          noteKey = 'budget.forecast.notEnoughMileage';
          continue;
        }
        const monthsAway = item.remainingKm / input.monthlyKm;
        within = monthsAway <= months;
      } else {
        continue;
      }
      if (!within) continue;
      const est = input.estimateCost(item);
      if (est.source === 'unknown') {
        unknownCount++;
        continue;
      }
      if (est.source === 'user') {
        known += est.amount;
      } else if (est.confidence === 'medium' || est.confidence === 'high') {
        estimated += est.amount;
      } else {
        unknownCount++;
      }
    }

    return { months, known, estimated, unknownCount, noteKey };
  });
}

export type UpcomingWindow = {
  days: 30 | 90 | 180 | 365;
  known: number;
  estimated: number;
  unknownCount: number;
};

export function upcomingCostWindows(input: {
  items: readonly HealthItem[];
  today: DateOnly;
  monthlyKm: number | null;
  estimateCost: (item: HealthItem) => CostEstimate;
}): UpcomingWindow[] {
  return ([30, 90, 180, 365] as const).map((days) => {
    let known = 0;
    let estimated = 0;
    let unknownCount = 0;
    for (const item of input.items) {
      let within = false;
      if (item.dueDate) {
        const d = daysBetween(input.today, item.dueDate);
        within = d >= 0 && d <= days;
      } else if (item.remainingKm != null && input.monthlyKm != null) {
        within = (item.remainingKm / input.monthlyKm) * 30.4375 <= days;
      } else if (item.remainingKm != null && input.monthlyKm == null) {
        continue;
      } else if (
        item.status === 'due' ||
        item.status === 'overdue' ||
        item.status === 'critical'
      ) {
        within = true;
      }
      if (!within) continue;
      const est = input.estimateCost(item);
      if (est.source === 'unknown') unknownCount++;
      else if (est.source === 'user') known += est.amount;
      else if (est.confidence === 'medium' || est.confidence === 'high') {
        estimated += est.amount;
      } else unknownCount++;
    }
    return { days, known, estimated, unknownCount };
  });
}

void (0 as unknown as Confidence);
