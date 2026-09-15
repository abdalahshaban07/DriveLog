import { describe, expect, it } from 'vitest';
import {
  evaluateAffordability,
  evaluateBudgetHealth,
  estimateExpectedCost,
  historicalMonthlyMaintenanceAverage,
  remainingMonthlyMaintenanceBudget,
  reserveTiers,
} from './budget-engine';
import { buildForecasts, estimateMonthlyKm } from './maintenance-forecast';
import { round2Sig, roundReserveLadder } from './maintenance-calc';
import type { Car, Maintenance, PartDefinition } from './models';

const car: Car = {
  id: 'c1',
  nickname: 'T',
  initialOdometer: 40_000,
  currentOdometer: 50_000,
  maintenanceBudgetMonthly: 2000,
  maintenanceReserveBalance: 3000,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('budget-engine', () => {
  it('rounds cost estimates to 2 significant digits', () => {
    expect(round2Sig(2867)).toBe(2900);
    expect(round2Sig(286)).toBe(290);
  });

  it('rounds reserve upward on ladder', () => {
    expect(roundReserveLadder(2667)).toBe(3000);
  });

  it('excludes unknown costs from monthly spend', () => {
    const rows: Maintenance[] = [
      {
        id: '1',
        type: 'oil',
        odometer: 1,
        cost: 500,
        currency: 'EGP',
        date: '2026-09-01',
        carId: 'c1',
        createdAt: 'a',
        updatedAt: 'a',
      },
      {
        id: '2',
        type: 'oil',
        odometer: 2,
        date: '2026-09-05',
        carId: 'c1',
        createdAt: 'b',
        updatedAt: 'b',
      },
    ];
    const rem = remainingMonthlyMaintenanceBudget(car, rows, 'EGP', '2026-09-15');
    expect(rem).toBe(1500);
  });

  it('prefers user expectedCost over history (73A)', () => {
    const part: PartDefinition = {
      id: 'p1',
      name: 'Pads',
      category: 'BRAKES',
      source: 'custom',
      trackingMode: 'history',
      active: true,
      expectedCost: 900,
      expectedCostCurrency: 'EGP',
      createdAt: 'a',
      updatedAt: 'a',
    };
    const est = estimateExpectedCost(part, [], 'c1', 'EGP');
    expect(est.source).toBe('user');
    expect(est.amount).toBe(900);
  });

  it('never emits TIGHT without reserve balance', () => {
    const a = evaluateAffordability({
      itemCost: 1500,
      remainingMonthly: 1000,
      reserveBalance: undefined,
      reserveMinimum: 500,
      knownEligible30: 0,
    });
    expect(a).not.toBe('TIGHT');
    expect(['CAN_AFFORD', 'NOT_RECOMMENDED', 'UNKNOWN']).toContain(a);
  });

  it('builds reserve tiers from history and upcoming', () => {
    const hist = historicalMonthlyMaintenanceAverage(
      car,
      [
        {
          id: '1',
          type: 'oil',
          odometer: 1,
          cost: 1200,
          currency: 'EGP',
          date: '2026-03-01',
          carId: 'c1',
          createdAt: 'a',
          updatedAt: 'a',
        },
      ],
      'EGP',
      '2026-09-15',
    );
    expect(hist).not.toBeNull();
    const tiers = reserveTiers({
      historicalMonthly: hist,
      eligible90: 3000,
      eligible180: 5000,
    });
    expect(tiers.recommended).toBeGreaterThan(0);
    expect(tiers.comfortable).toBeGreaterThanOrEqual(tiers.recommended!);
  });

  it('scores CRITICAL when due costs exceed remaining + reserve', () => {
    const health = evaluateBudgetHealth({
      car,
      currentMonthSpend: 100,
      remainingMonthly: 1900,
      eligible90: 1000,
      criticalDueCost: 6000,
      reserveRecommended: 2000,
      reserveComfortable: 2500,
    });
    expect(health).toBe('CRITICAL');
  });
});

describe('maintenance-forecast', () => {
  it('requires spaced odometer samples for monthly km', () => {
    const rate = estimateMonthlyKm({
      car,
      fills: [
        {
          id: 'f1',
          odometer: 40_000,
          liters: 40,
          cost: 100,
          tankFull: true,
          date: '2026-04-01',
          createdAt: 'a',
          updatedAt: 'a',
        },
        {
          id: 'f2',
          odometer: 46_000,
          liters: 40,
          cost: 100,
          tankFull: true,
          date: '2026-09-01',
          createdAt: 'b',
          updatedAt: 'b',
        },
      ],
      maintenance: [],
      breakdowns: [],
      today: '2026-09-15',
    });
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
  });

  it('buildForecasts returns 3/6/12 windows', () => {
    const f = buildForecasts({
      items: [],
      today: '2026-09-15',
      monthlyKm: 1000,
      estimateCost: () => ({
        amount: 0,
        confidence: 'low',
        currency: 'EGP',
        source: 'unknown',
      }),
    });
    expect(f.map((x) => x.months)).toEqual([3, 6, 12]);
  });
});
