import { describe, expect, it } from 'vitest';
import {
  activePeriod,
  inActivePeriod,
  newOpenPeriod,
  periodTotals,
  startNewPeriod,
} from './expense-period';
import { buildExpenseLedger, ledgerCategoryTotals } from './expense-ledger';
import { fuelDashboardMetrics } from './fuel-dashboard';
import {
  addMilestoneAfter,
  completeTask,
  nextTargetKm,
  seedMilestone,
  taskKmRemaining,
} from './milestones';
import type { Breakdown, FillUp, Maintenance, OtherExpense } from './models';

describe('expense-period', () => {
  it('tracks one open period per car and rolls over', () => {
    const open = newOpenPeriod('c1', '2026-01-01');
    expect(activePeriod([open], 'c1')?.id).toBe(open.id);
    const rolled = startNewPeriod([open], 'c1', '2026-02-01');
    expect(rolled.find((p) => p.id === open.id)?.endDate).toBe('2026-02-01');
    expect(activePeriod(rolled, 'c1')?.startDate).toBe('2026-02-01');
  });

  it('sums category totals inside the period only', () => {
    const period = newOpenPeriod('c1', '2026-06-01');
    const fills: FillUp[] = [
      {
        id: 'f1',
        carId: 'c1',
        odometer: 1,
        liters: 40,
        cost: 100,
        tankFull: true,
        date: '2026-06-10',
        createdAt: 'a',
        updatedAt: 'a',
      },
      {
        id: 'f2',
        carId: 'c1',
        odometer: 2,
        liters: 40,
        cost: 50,
        tankFull: true,
        date: '2026-05-01',
        createdAt: 'a',
        updatedAt: 'a',
      },
    ];
    const maint: Maintenance[] = [
      {
        id: 'm1',
        carId: 'c1',
        type: 'oil',
        odometer: 1,
        cost: 200,
        date: '2026-06-15',
        createdAt: 'a',
        updatedAt: 'a',
      },
    ];
    const br: Breakdown[] = [
      {
        id: 'b1',
        carId: 'c1',
        symptom: 'noise',
        repairCost: 300,
        odometer: 1,
        date: '2026-06-20',
        category: 'mechanical',
        createdAt: 'a',
        updatedAt: 'a',
      },
    ];
    const other: OtherExpense[] = [
      {
        id: 'o1',
        carId: 'c1',
        label: 'wash',
        amount: 40,
        date: '2026-06-21',
        createdAt: 'a',
        updatedAt: 'a',
      },
    ];
    expect(inActivePeriod('2026-05-01', period)).toBe(false);
    const t = periodTotals(period, fills, maint, br, other);
    expect(t.fuel).toBe(100);
    expect(t.maintenance).toBe(200);
    expect(t.breakdowns).toBe(300);
    expect(t.other).toBe(40);
    expect(t.total).toBe(640);
  });
});

describe('expense-ledger', () => {
  it('merges and sorts ledger rows', () => {
    const rows = buildExpenseLedger({
      fills: [
        {
          id: 'f1',
          odometer: 1,
          liters: 10,
          cost: 80,
          tankFull: true,
          date: '2026-06-02',
          placeLabel: 'Station',
          createdAt: '2026-06-02T10:00:00.000Z',
          updatedAt: 'a',
        },
      ],
      maintenance: [],
      breakdowns: [
        {
          id: 'b1',
          carId: 'c',
          symptom: 'Click',
          repairCost: 50,
          odometer: 1,
          date: '2026-06-03',
          category: 'electrical',
          createdAt: '2026-06-03T10:00:00.000Z',
          updatedAt: 'a',
        },
      ],
      other: [],
    });
    expect(rows[0]?.category).toBe('breakdown');
    expect(ledgerCategoryTotals(rows).total).toBe(130);
  });
});

describe('milestones', () => {
  it('seeds next 10k target and completes tasks', () => {
    expect(nextTargetKm(168_420)).toBe(170_000);
    const m = seedMilestone('c1', 168_420);
    expect(m.targetKm).toBe(170_000);
    expect(taskKmRemaining(m.tasks[0]!, m, 168_420)).toBe(1580);
    const done = completeTask(m, m.tasks[0]!.id, 'maint-1', 170_000);
    expect(done.tasks[0]?.maintenanceId).toBe('maint-1');
    const next = addMilestoneAfter('c1', [done], 170_000);
    expect(next.targetKm).toBe(180_000);
  });
});

describe('fuel-dashboard', () => {
  it('computes last-segment metrics from full-to-full fills', () => {
    const fills: FillUp[] = [
      {
        id: 'a',
        odometer: 10000,
        liters: 50,
        cost: 70,
        tankFull: true,
        date: '2026-01-01',
        createdAt: 'a',
        updatedAt: 'a',
      },
      {
        id: 'b',
        odometer: 10500,
        liters: 45,
        cost: 65,
        tankFull: true,
        date: '2026-01-10',
        createdAt: 'b',
        updatedAt: 'b',
      },
    ];
    const m = fuelDashboardMetrics(fills);
    expect(m.lastL100).toBe(9);
    expect(m.costPerKm).toBeCloseTo(0.27, 2);
    expect(m.lastKmPerL).toBeCloseTo(100 / 9, 5);
  });
});
