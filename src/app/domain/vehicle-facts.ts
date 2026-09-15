import type { Db } from '../data/db';
import {
  estimateExpectedCost,
  evaluateAffordability,
  evaluateBudgetHealth,
  fuelSpendTrend,
  historicalMonthlyMaintenanceAverage,
  knownMaintenanceSpend,
  remainingMonthlyMaintenanceBudget,
  reserveTiers,
  criticalDueCostSum,
} from './budget-engine';
import { buildDataQualityTips } from './data-quality';
import { buildForecasts, estimateMonthlyKm, upcomingCostWindows } from './maintenance-forecast';
import type { AdvisorFacts } from './smart-advisor';
import { generateInsights, type Insight } from './insight-generator';
import { attentionCount, buildHealthItems } from './vehicle-health';
import type { DateOnly } from './models';

function todayDateOnly(): DateOnly {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type VehicleFactsBundle = AdvisorFacts & { insights: Insight[] };

export function buildVehicleFacts(db: Db): VehicleFactsBundle | null {
  const car = db.car();
  if (!car) return null;
  const today = todayDateOnly();
  const currency = db.snapshotCurrency();
  const maintenance = db.maintenance();
  const settings = db.settings();

  const healthItems = buildHealthItems({
    car,
    today,
    maintenance,
    customParts: db.parts(),
    overrides: db.partOverrides(),
    settings,
  });

  const estimate = (item: (typeof healthItems)[number]) =>
    estimateExpectedCost(item.part, maintenance, car.id, currency);

  const monthlyKm = estimateMonthlyKm({
    car,
    fills: db.fillUps(),
    maintenance,
    breakdowns: db.breakdowns(),
    today,
  });
  const windows = upcomingCostWindows({
    items: healthItems,
    today,
    monthlyKm,
    estimateCost: estimate,
  });
  const w90 = windows.find((w) => w.days === 90);
  const w180 = windows.find((w) => w.days === 180);
  const w30 = windows.find((w) => w.days === 30);
  const eligible90 = (w90?.known ?? 0) + (w90?.estimated ?? 0);
  const eligible180 = (w180?.known ?? 0) + (w180?.estimated ?? 0);
  const eligible30 = (w30?.known ?? 0) + (w30?.estimated ?? 0);

  const hist = historicalMonthlyMaintenanceAverage(car, maintenance, currency, today);
  const tiers = reserveTiers({
    historicalMonthly: hist,
    eligible90,
    eligible180,
  });
  const remaining = remainingMonthlyMaintenanceBudget(car, maintenance, currency, today);
  const prefix = today.slice(0, 7);
  const { known: currentMonthSpend } = knownMaintenanceSpend(
    maintenance,
    currency,
    (m) => (!m.carId || m.carId === car.id) && m.date.startsWith(prefix),
  );
  const criticalCost = criticalDueCostSum(healthItems, estimate);
  const budgetHealth = evaluateBudgetHealth({
    car,
    remainingMonthly: remaining,
    currentMonthSpend,
    eligible90,
    reserveRecommended: tiers.recommended,
    reserveComfortable: tiers.comfortable,
    criticalDueCost: criticalCost,
  });

  const fuel = fuelSpendTrend(db.fillUps(), today);
  const forecasts = buildForecasts({
    items: healthItems,
    today,
    monthlyKm,
    estimateCost: estimate,
  });

  const savingRecommendation =
    (tiers.recommended != null &&
      car.reserveTargetMonthly != null &&
      tiers.recommended <= car.reserveTargetMonthly * 0.8) ||
    (car.maintenanceBudgetMonthly != null &&
      currentMonthSpend <= 0.75 * car.maintenanceBudgetMonthly &&
      eligible90 <= (remaining ?? 0) + (car.maintenanceReserveBalance ?? 0));

  const facts: AdvisorFacts = {
    budgetHealth,
    healthItems,
    eligible90,
    fuelRisePct: fuel?.risePct ?? null,
    costAnomaly: false,
    savingRecommendation,
    forecastAvailable: forecasts.some((f) => f.known + f.estimated > 0),
    dataQuality: buildDataQualityTips(maintenance, car.id),
    monthlyBudget: car.maintenanceBudgetMonthly ?? null,
    recommendedReserve: tiers.recommended,
    reserveTarget: car.reserveTargetMonthly ?? null,
    affordability: evaluateAffordability({
      itemCost: eligible90 || null,
      remainingMonthly: remaining,
      reserveBalance: car.maintenanceReserveBalance,
      reserveMinimum: tiers.minimum,
      knownEligible30: eligible30,
    }),
  };
  return { ...facts, insights: generateInsights(facts) };
}

export function homeHealthSummary(db: Db) {
  const facts = buildVehicleFacts(db);
  if (!facts) {
    return {
      attention: 0,
      top: [] as ReturnType<typeof buildHealthItems>,
      facts: null as VehicleFactsBundle | null,
    };
  }
  return {
    attention: attentionCount(facts.healthItems),
    top: facts.healthItems.filter((i) => i.status !== 'good').slice(0, 3),
    facts,
  };
}

export { todayDateOnly };
