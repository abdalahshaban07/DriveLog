import type {
  Breakdown,
  DateOnly,
  ExpenseCategory,
  FillUp,
  Maintenance,
  OtherExpense,
} from './models';
import { compareDateOnly } from './dues';

export interface LedgerRow {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: DateOnly;
  time?: string;
  meta?: string;
  sortAt: string;
}

export type LedgerPeriodFilter = 'all' | '30d' | '3m' | '6m' | 'custom';

function monthsBack(n: number, from: Date = new Date()): DateOnly {
  const d = new Date(from.getFullYear(), from.getMonth() - n, from.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function periodFilterStart(
  period: LedgerPeriodFilter,
  customFrom?: DateOnly,
): DateOnly | null {
  switch (period) {
    case 'all':
      return null;
    case '30d': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    case '3m':
      return monthsBack(3);
    case '6m':
      return monthsBack(6);
    case 'custom':
      return customFrom ?? null;
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

function inRange(
  date: DateOnly,
  start: DateOnly | null,
  end: DateOnly | null,
): boolean {
  if (start && compareDateOnly(date, start) < 0) {
    return false;
  }
  if (end && compareDateOnly(date, end) > 0) {
    return false;
  }
  return true;
}

export function buildExpenseLedger(input: {
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  breakdowns: readonly Breakdown[];
  other: readonly OtherExpense[];
  category?: ExpenseCategory | 'all';
  period?: LedgerPeriodFilter;
  customFrom?: DateOnly;
  customTo?: DateOnly;
}): LedgerRow[] {
  const cat = input.category ?? 'all';
  const start = periodFilterStart(input.period ?? 'all', input.customFrom);
  const end = input.period === 'custom' ? (input.customTo ?? null) : null;
  const rows: LedgerRow[] = [];

  if (cat === 'all' || cat === 'fuel') {
    for (const f of input.fills) {
      if (!inRange(f.date, start, end)) {
        continue;
      }
      rows.push({
        id: `fuel-${f.id}`,
        category: 'fuel',
        title: f.placeLabel || 'Fuel',
        amount: f.cost,
        date: f.date,
        time: f.createdAt.slice(11, 16),
        meta: [f.liters ? `${f.liters} L` : null, f.fuelGrade, f.unitPrice != null ? `@ ${f.unitPrice}` : null]
          .filter(Boolean)
          .join(' · '),
        sortAt: f.createdAt,
      });
    }
  }

  if (cat === 'all' || cat === 'maintenance') {
    for (const m of input.maintenance) {
      if (!inRange(m.date, start, end)) {
        continue;
      }
      rows.push({
        id: `maint-${m.id}`,
        category: 'maintenance',
        title: m.otherLabel || m.centerName || m.type,
        amount: m.cost,
        date: m.date,
        time: m.createdAt.slice(11, 16),
        meta: m.odometer ? `${m.odometer} km` : undefined,
        sortAt: m.createdAt,
      });
    }
  }

  if (cat === 'all' || cat === 'breakdown') {
    for (const b of input.breakdowns) {
      if (!inRange(b.date, start, end)) {
        continue;
      }
      rows.push({
        id: `br-${b.id}`,
        category: 'breakdown',
        title: b.symptom,
        amount: b.repairCost,
        date: b.date,
        time: b.createdAt.slice(11, 16),
        meta: [b.category, b.shopName].filter(Boolean).join(' · '),
        sortAt: b.createdAt,
      });
    }
  }

  if (cat === 'all' || cat === 'other') {
    for (const o of input.other) {
      if (!inRange(o.date, start, end)) {
        continue;
      }
      rows.push({
        id: `oth-${o.id}`,
        category: 'other',
        title: o.label,
        amount: o.amount,
        date: o.date,
        time: o.createdAt.slice(11, 16),
        meta: o.note,
        sortAt: o.createdAt,
      });
    }
  }

  return rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt) || b.date.localeCompare(a.date));
}

export function ledgerCategoryTotals(rows: readonly LedgerRow[]): {
  fuel: number;
  maintenance: number;
  breakdown: number;
  other: number;
  total: number;
} {
  const out = { fuel: 0, maintenance: 0, breakdown: 0, other: 0, total: 0 };
  for (const r of rows) {
    out[r.category] += r.amount;
    out.total += r.amount;
  }
  return out;
}
