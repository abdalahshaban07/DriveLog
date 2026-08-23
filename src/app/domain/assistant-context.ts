import { fuelDashboardMetrics } from './fuel-dashboard';
import { periodTotals, activePeriod } from './expense-period';
import { nextMilestone } from './milestones';
import type {
  Breakdown,
  Car,
  ExpensePeriod,
  FillUp,
  Maintenance,
  MaintenanceMilestone,
  OtherExpense,
  Settings,
} from './models';

/** Compact summary for LLM — no VIN, coords, or API keys. */
export function buildAssistantContext(input: {
  car: Car | null;
  settings: Settings;
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  breakdowns: readonly Breakdown[];
  other: readonly OtherExpense[];
  periods: readonly ExpensePeriod[];
  milestones: readonly MaintenanceMilestone[];
}): Record<string, unknown> {
  const car = input.car;
  if (!car) {
    return { hasCar: false };
  }
  const period = activePeriod(input.periods, car.id);
  const totals = periodTotals(
    period,
    input.fills,
    input.maintenance,
    input.breakdowns,
    input.other,
  );
  const fuel = fuelDashboardMetrics(input.fills);
  const next = nextMilestone(input.milestones, car.currentOdometer);
  return {
    hasCar: true,
    nickname: car.nickname,
    plate: car.plate ?? null,
    odometer: car.currentOdometer,
    currency: input.settings.currency,
    periodStart: period?.startDate ?? null,
    periodTotals: totals,
    fuel,
    nextMilestoneKm: next?.targetKm ?? null,
    recentBreakdowns: input.breakdowns.slice(-5).map((b) => ({
      symptom: b.symptom,
      category: b.category,
      cost: b.repairCost,
      date: b.date,
    })),
    maintenanceCount: input.maintenance.length,
    fillUpCount: input.fills.length,
  };
}

export const RULE_BASED_FUEL_TIPS = [
  'Log every fill-up with tank-full when possible — that is how accurate L/100km is calculated.',
  'Keep tire pressure at the manufacturer’s recommendation; underinflation raises fuel use.',
  'Avoid long idling with AC on — it burns fuel without adding distance to your economy stats.',
  'Compare 92 vs 95 cost/km on the Fuel tab before switching grades permanently.',
] as const;

export function pickRuleBasedTip(seed = Date.now()): string {
  const i = Math.abs(seed) % RULE_BASED_FUEL_TIPS.length;
  return RULE_BASED_FUEL_TIPS[i]!;
}
