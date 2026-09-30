import { activePeriod, periodTotals, type PeriodTotals } from './expense-period';
import { fuelDashboardMetrics } from './fuel-dashboard';
import type { Car } from './models';
import { askLocal, partLabel, statusKey, type AdvisorFacts, type CoachLogs } from './smart-advisor';
import { buildVehicleFacts, type VehicleFactsBundle } from './vehicle-facts';
import type { AdvisorIntent } from './advisor-intent';
import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';

export type CoachSource = 'local' | 'remote';

export type CoachReply = {
  text: string;
  source: CoachSource;
};

export type CoachInputs = {
  car: Car;
  facts: VehicleFactsBundle;
  logs: CoachLogs;
  totals: PeriodTotals;
};

type CoachPartSnapshot = {
  name: string;
  status: string;
};

export type CoachSnapshot = {
  nickname: string;
  odometer: number;
  currency: string;
  budgetHealth: AdvisorFacts['budgetHealth'];
  affordability: AdvisorFacts['affordability'];
  recommendedReserve: number | null;
  reserveTarget: number | null;
  monthlyBudget: number | null;
  eligible90: number;
  fuelRisePct: number | null;
  lastL100: number | null;
  periodTotal: number;
  fuel: number;
  maintenance: number;
  breakdown: number;
  other: number;
  maintenanceCount: number;
  breakdownCount: number;
  parts: CoachPartSnapshot[];
};

type Translate = (key: MsgKey, params?: Record<string, string | number>) => string;

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

export function loadCoachInputs(db: Db): CoachInputs | null {
  const facts = buildVehicleFacts(db);
  if (!facts) return null;
  const car = db.car();
  if (!car) return null;
  const totals = periodTotals(
    activePeriod(db.expensePeriods(), car.id),
    db.fillUps(),
    db.maintenance(),
    db.breakdowns(),
    db.otherExpenses(),
  );
  const fuel = fuelDashboardMetrics(db.fillUps());
  return {
    car,
    facts,
    totals,
    logs: {
      currency: db.settings().currency,
      periodTotal: totals.total,
      maintenanceCount: db.maintenance().length,
      breakdownCount: db.breakdowns().length,
      lastL100: fuel.lastL100,
    },
  };
}

export function coachSnapshot(
  facts: AdvisorFacts,
  logs: CoachLogs,
  totals: PeriodTotals,
  car: Car,
  t: Translate,
): CoachSnapshot {
  const parts = facts.healthItems
    .filter((item) => item.status !== 'good')
    .slice(0, 5)
    .map((item) => ({
      name: partLabel(item, t),
      status: t(statusKey(item.status)),
    }));
  return {
    nickname: car.nickname,
    odometer: car.currentOdometer,
    currency: logs.currency,
    budgetHealth: facts.budgetHealth,
    affordability: facts.affordability,
    recommendedReserve: roundOrNull(facts.recommendedReserve),
    reserveTarget: facts.reserveTarget,
    monthlyBudget: facts.monthlyBudget,
    eligible90: Math.round(facts.eligible90),
    fuelRisePct: facts.fuelRisePct,
    lastL100: logs.lastL100,
    periodTotal: Math.round(totals.total),
    fuel: totals.fuel,
    maintenance: totals.maintenance,
    breakdown: totals.breakdowns,
    other: totals.other,
    maintenanceCount: logs.maintenanceCount,
    breakdownCount: logs.breakdownCount,
    parts,
  };
}

export function localCoachAnswer(
  question: string,
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
  intentHint?: AdvisorIntent,
): CoachReply {
  const answer = askLocal(question, facts, logs, t, intentHint);
  const text = `${t(answer.titleKey)} ${t(answer.bodyKey, answer.params)}`.trim();
  return { text, source: 'local' };
}
