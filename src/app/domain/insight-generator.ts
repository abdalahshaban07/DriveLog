import type { Affordability, BudgetHealth } from './budget-engine';
import type { HealthItem } from './vehicle-health';
import type { DataQualityTip } from './data-quality';

export type InsightKind =
  | 'BUDGET_HEALTH'
  | 'BUDGET_WARNING'
  | 'UPCOMING_EXPENSE'
  | 'MAINTENANCE_PRIORITY'
  | 'FUEL_SPENDING'
  | 'COST_ANOMALY'
  | 'SAVING_RECOMMENDATION'
  | 'MISSING_DATA'
  | 'MAINTENANCE_FORECAST';

export type Insight = {
  id: string;
  kind: InsightKind;
  titleKey: string;
  bodyKey: string;
  urgency: number;
  financialImpact: number;
  nearestDue: string;
};

export function generateInsights(input: {
  budgetHealth: BudgetHealth;
  healthItems: readonly HealthItem[];
  eligible90: number;
  fuelRisePct: number | null;
  costAnomaly: boolean;
  savingRecommendation: boolean;
  forecastAvailable: boolean;
  dataQuality: readonly DataQualityTip[];
  monthlyBudget: number | null;
}): Insight[] {
  const out: Insight[] = [];

  if (input.budgetHealth === 'HIGH' || input.budgetHealth === 'CRITICAL') {
    out.push({
      id: 'budget-warn',
      kind: 'BUDGET_WARNING',
      titleKey: 'advisor.insight.budgetWarning',
      bodyKey: 'advisor.insight.budgetWarningBody',
      urgency: input.budgetHealth === 'CRITICAL' ? 0 : 1,
      financialImpact: 1,
      nearestDue: '9999',
    });
  } else if (input.budgetHealth !== 'UNKNOWN') {
    out.push({
      id: 'budget-health',
      kind: 'BUDGET_HEALTH',
      titleKey: 'advisor.insight.budgetHealth',
      bodyKey: 'advisor.insight.budgetHealthBody',
      urgency: 5,
      financialImpact: 0,
      nearestDue: '9999',
    });
  }

  if (input.eligible90 > 0) {
    out.push({
      id: 'upcoming',
      kind: 'UPCOMING_EXPENSE',
      titleKey: 'advisor.insight.upcoming',
      bodyKey: 'advisor.insight.upcomingBody',
      urgency: 2,
      financialImpact:
        input.monthlyBudget && input.monthlyBudget > 0
          ? input.eligible90 / input.monthlyBudget
          : 0,
      nearestDue: '9999',
    });
  }

  const top = input.healthItems.find(
    (i) => i.status !== 'good' && i.status !== 'unknown',
  );
  if (top) {
    out.push({
      id: `priority-${top.partDefinitionId}`,
      kind: 'MAINTENANCE_PRIORITY',
      titleKey: 'advisor.insight.priority',
      bodyKey: 'advisor.insight.priorityBody',
      urgency: statusUrgency(top.status),
      financialImpact: 0,
      nearestDue: top.dueDate ?? String(top.remainingKm ?? 999999),
    });
  }

  if (input.fuelRisePct != null) {
    out.push({
      id: 'fuel',
      kind: 'FUEL_SPENDING',
      titleKey: 'advisor.insight.fuel',
      bodyKey: 'advisor.insight.fuelBody',
      urgency: 3,
      financialImpact: input.fuelRisePct / 100,
      nearestDue: '9999',
    });
  }

  if (input.costAnomaly) {
    out.push({
      id: 'anomaly',
      kind: 'COST_ANOMALY',
      titleKey: 'advisor.insight.anomaly',
      bodyKey: 'advisor.insight.anomalyBody',
      urgency: 2,
      financialImpact: 0.5,
      nearestDue: '9999',
    });
  }

  if (input.savingRecommendation) {
    out.push({
      id: 'saving',
      kind: 'SAVING_RECOMMENDATION',
      titleKey: 'advisor.insight.saving',
      bodyKey: 'advisor.insight.savingBody',
      urgency: 6,
      financialImpact: 0,
      nearestDue: '9999',
    });
  }

  if (input.dataQuality.length) {
    out.push({
      id: 'dq',
      kind: 'MISSING_DATA',
      titleKey: 'advisor.insight.missingData',
      bodyKey: 'advisor.insight.missingDataBody',
      urgency: 4,
      financialImpact: 0,
      nearestDue: '9999',
    });
  }

  out.push({
    id: 'forecast',
    kind: 'MAINTENANCE_FORECAST',
    titleKey: input.forecastAvailable
      ? 'advisor.insight.forecast'
      : 'advisor.insight.forecastThin',
    bodyKey: input.forecastAvailable
      ? 'advisor.insight.forecastBody'
      : 'advisor.insight.forecastThinBody',
    urgency: 7,
    financialImpact: 0,
    nearestDue: '9999',
  });

  return rankInsights(out).slice(0, 3);
}

function statusUrgency(s: HealthItem['status']): number {
  switch (s) {
    case 'critical':
      return 0;
    case 'overdue':
      return 1;
    case 'due':
      return 2;
    case 'inspect':
      return 3;
    case 'soon':
      return 4;
    default:
      return 8;
  }
}

/** Lexicographic ranking (65A). */
export function rankInsights(insights: readonly Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency;
    if (a.financialImpact !== b.financialImpact) {
      return b.financialImpact - a.financialImpact;
    }
    if (a.nearestDue !== b.nearestDue) return a.nearestDue.localeCompare(b.nearestDue);
    return a.id.localeCompare(b.id);
  });
}

export type AdvisorResponse = {
  intent: string;
  titleKey: string;
  bodyKey: string;
  confidence: 'low' | 'medium' | 'high';
  sources: string[];
  affordability?: Affordability;
  insights: Insight[];
};

void (0 as unknown as BudgetHealth);
