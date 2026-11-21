import { describe, expect, it } from 'vitest';
import { activeMaintenanceDueRecords } from './maintenance-lifecycle';
import { buildExpenseLedger } from './expense-ledger';
import { periodTotals } from './expense-period';
import { buildReportBrief } from './smart-reports';
import type { Maintenance, FillUp, Breakdown, OtherExpense } from './models';

const ts = '2026-11-01T10:00:00Z';
const base = { carId: 'c1', date: '2026-11-01', createdAt: ts, updatedAt: ts };
const oil = (id: string, cost?: number): Maintenance => ({
  ...base,
  id,
  type: 'oil',
  partDefinitionId: 'sys-engine-oil',
  recordType: 'service',
  odometer: 10000,
  cost,
});
const fills: FillUp[] = [
  { ...base, id: 'f1', odometer: 10000, liters: 20, cost: 400, tankFull: true },
];
const breaks: Breakdown[] = [
  { ...base, id: 'b1', symptom: 'test', category: 'other', repairCost: 50, odometer: 10000 },
];
const other: OtherExpense[] = [{ ...base, id: 'o1', label: 'Parking', amount: 25 }];
const period = { id: 'p1', carId: 'c1', startDate: '2026-11-01' };

describe('core ledger invariants across maintenance cycles', () => {
  it('retires old reminders but keeps every historical expense in totals and reports', () => {
    const maintenance = [
      oil('old', 100),
      { ...oil('new', 200), date: '2026-11-20', odometer: 15000 },
      oil('unknown'),
    ];
    const totals = periodTotals(period, fills, maintenance, breaks, other);
    expect(totals).toEqual({ fuel: 400, maintenance: 300, breakdowns: 50, other: 25, total: 775 });
    const ledger = buildExpenseLedger({ fills, maintenance, breakdowns: breaks, other });
    expect(ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(totals.total);
    expect(buildReportBrief({ fills, maintenance, period, totals }).maintCount).toBe(3);
    expect(activeMaintenanceDueRecords(maintenance).map((row) => row.id)).toEqual(['new']);
    expect(maintenance).toHaveLength(3);
  });
  it('a correction replaces the amount, whereas a new service adds it; unknown is not zero-cost proof', () => {
    const before = [oil('old', 100)];
    const corrected = [{ ...before[0], cost: 150 }];
    const added = [...corrected, { ...oil('next', 200), date: '2026-11-20' }];
    expect(periodTotals(period, [], before, [], []).maintenance).toBe(100);
    expect(periodTotals(period, [], corrected, [], []).maintenance).toBe(150);
    expect(periodTotals(period, [], added, [], []).maintenance).toBe(350);
    expect(
      buildExpenseLedger({ fills: [], maintenance: [oil('unknown')], breakdowns: [], other: [] }),
    ).toEqual([]);
    expect(
      buildExpenseLedger({ fills: [], maintenance: [oil('free', 0)], breakdowns: [], other: [] }),
    ).toHaveLength(1);
  });
});
