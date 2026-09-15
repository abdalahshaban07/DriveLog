import { detectAdvisorIntent, type AdvisorIntent } from './advisor-intent';
import {
  generateInsights,
  type AdvisorResponse,
  type Insight,
} from './insight-generator';
import type { Affordability, BudgetHealth } from './budget-engine';
import type { HealthItem } from './vehicle-health';
import type { DataQualityTip } from './data-quality';

export type AdvisorFacts = {
  budgetHealth: BudgetHealth;
  healthItems: readonly HealthItem[];
  eligible90: number;
  fuelRisePct: number | null;
  costAnomaly: boolean;
  savingRecommendation: boolean;
  forecastAvailable: boolean;
  dataQuality: readonly DataQualityTip[];
  monthlyBudget: number | null;
  recommendedReserve: number | null;
  reserveTarget: number | null;
  affordability: Affordability;
};

export interface AdvisorProvider {
  ask(question: string, facts: AdvisorFacts): AdvisorResponse;
}

export class LocalAdvisorProvider implements AdvisorProvider {
  ask(question: string, facts: AdvisorFacts): AdvisorResponse {
    const intent = detectAdvisorIntent(question);
    const insights = generateInsights(facts);
    return respond(intent, facts, insights);
  }
}

function respond(
  intent: AdvisorIntent,
  facts: AdvisorFacts,
  insights: Insight[],
): AdvisorResponse {
  const base = {
    confidence: 'medium' as const,
    sources: ['LOCAL_FACTS'],
    insights,
  };

  switch (intent) {
    case 'RECOMMENDED_RESERVE':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.reserveTitle',
        bodyKey:
          facts.recommendedReserve == null
            ? 'advisor.answer.reserveUnknown'
            : 'advisor.answer.reserveBody',
      };
    case 'MAINTENANCE_PRIORITY':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.priorityTitle',
        bodyKey: 'advisor.answer.priorityBody',
      };
    case 'FUEL_SPENDING':
    case 'SPENDING_TREND':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.fuelTitle',
        bodyKey:
          facts.fuelRisePct == null
            ? 'advisor.answer.fuelUnknown'
            : 'advisor.answer.fuelBody',
      };
    case 'UPCOMING_MAINTENANCE':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.upcomingTitle',
        bodyKey: 'advisor.answer.upcomingBody',
      };
    case 'AFFORDABILITY':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.affordTitle',
        bodyKey: 'advisor.answer.affordBody',
        affordability: facts.affordability,
      };
    case 'BUDGET_HEALTH':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.budgetTitle',
        bodyKey: 'advisor.answer.budgetBody',
      };
    case 'PART_STATUS':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.partStatusTitle',
        bodyKey: 'advisor.answer.partStatusBody',
      };
    case 'PART_HISTORY':
      return {
        ...base,
        intent,
        titleKey: 'advisor.answer.partHistoryTitle',
        bodyKey: 'advisor.answer.partHistoryBody',
      };
    case 'UNSUPPORTED':
      return {
        ...base,
        intent,
        confidence: 'low',
        titleKey: 'advisor.answer.unsupportedTitle',
        bodyKey: 'advisor.answer.unsupportedBody',
      };
    default: {
      const _e: never = intent;
      return _e;
    }
  }
}

export function createLocalAdvisor(): AdvisorProvider {
  return new LocalAdvisorProvider();
}
