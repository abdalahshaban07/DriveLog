import { todayDateOnly } from './dues';
import type { DateOnly, FillUp, FuelGrade, Maintenance } from './models';

export type HistoryRangePreset = 'thisMonth' | '3months' | 'year' | 'custom';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toDateOnly(dt: Date): DateOnly {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calendar-month bounds for history range presets (custom uses caller-supplied dates). */
export function rangeBoundsForPreset(
  preset: Exclude<HistoryRangePreset, 'custom'>,
  today: DateOnly = todayDateOnly(),
): { from: DateOnly; to: DateOnly } {
  const [y, mo] = today.split('-').map(Number);
  const to = today;
  switch (preset) {
    case 'thisMonth':
      return { from: `${y}-${String(mo).padStart(2, '0')}-01`, to };
    case '3months': {
      const fromDt = new Date(y!, mo! - 1 - 2, 1);
      return { from: toDateOnly(fromDt), to };
    }
    case 'year':
      return { from: `${y}-01-01`, to };
  }
}

export function fillUpsToCsv(rows: readonly FillUp[]): string {
  const header = [
    'date',
    'odometer',
    'liters',
    'cost',
    'unitPrice',
    'fuelGrade',
    'tankFull',
    'placeLabel',
    'note',
  ];
  const lines = [header.join(',')];
  for (const f of rows) {
    lines.push(
      [
        f.date,
        f.odometer,
        f.liters,
        f.cost,
        f.unitPrice ?? '',
        f.fuelGrade ?? '',
        f.tankFull ? '1' : '0',
        csvEscape(f.placeLabel ?? ''),
        csvEscape(f.note ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function maintenanceToCsv(rows: readonly Maintenance[]): string {
  const header = [
    'date',
    'type',
    'otherLabel',
    'odometer',
    'cost',
    'dueKm',
    'dueDate',
    'note',
    'centerName',
    'technicianName',
    'partBrand',
    'partCost',
    'laborCost',
  ];
  const lines = [header.join(',')];
  for (const m of rows) {
    lines.push(
      [
        m.date,
        m.type,
        csvEscape(m.otherLabel ?? ''),
        m.odometer,
        m.cost,
        m.dueKm ?? '',
        m.dueDate ?? '',
        csvEscape(m.note ?? ''),
        csvEscape(m.centerName ?? ''),
        csvEscape(m.technicianName ?? ''),
        csvEscape(m.partBrand ?? ''),
        m.partCost ?? '',
        m.laborCost ?? '',
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function filterFillUps(
  rows: readonly FillUp[],
  opts: { grade?: FuelGrade | 'all'; from?: string; to?: string },
): FillUp[] {
  return rows.filter((f) => {
    if (opts.grade && opts.grade !== 'all' && f.fuelGrade !== opts.grade) {
      return false;
    }
    if (opts.from && f.date < opts.from) {
      return false;
    }
    if (opts.to && f.date > opts.to) {
      return false;
    }
    return true;
  });
}

export function filterMaintenance(
  rows: readonly Maintenance[],
  opts: { type?: string | 'all'; from?: string; to?: string },
): Maintenance[] {
  return rows.filter((m) => {
    if (opts.type && opts.type !== 'all') {
      const rowType = m.otherLabel ? `custom:${m.otherLabel}` : m.type;
      if (rowType !== opts.type) {
        return false;
      }
    }
    if (opts.from && m.date < opts.from) {
      return false;
    }
    if (opts.to && m.date > opts.to) {
      return false;
    }
    return true;
  });
}
