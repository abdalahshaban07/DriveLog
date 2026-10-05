import { todayDateOnly } from './dues';
import type { DateOnly, FillUp, FuelGrade, Maintenance } from './models';
import {
  metricBand,
  masthead,
  monthSection,
  pdfBlob,
  pdfDate,
  pdfNum,
  reportShell,
  type PdfFact,
} from './pdf-theme';

export type HistoryRangePreset = 'thisMonth' | '3months' | 'year' | 'custom';

export type ExportPdfCopy = {
  title: string;
  generated: string;
  summary: string;
  entries: string;
  totalCost: string;
  totalLiters?: string;
  totalKm?: string;
  rangeLabel?: string;
  avgCost?: string;
  avgPrice?: string;
  /** Month-table footer: row count, and the label above the cost-column total. */
  monthItems?: string;
  monthCost?: string;
  /** البند. Falls back to the type column header. */
  itemHeader?: string;
  /** Localized column headers (CSV stays English keys). */
  columnHeaders: string[];
};

const FILL_HEADERS = [
  'date',
  'odometer',
  'liters',
  'cost',
  'unitPrice',
  'fuelGrade',
  'placeLabel',
  'note',
] as const;

const MAINT_HEADERS = [
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
] as const;

function toDateOnly(dt: Date): DateOnly {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Short fuel-grade labels for CSV/PDF: gasoline92 → 92, keep diesel/solar/custom.
 */
export function formatFuelGradeLabel(grade: string | undefined | null): string {
  if (!grade) {
    return '';
  }
  switch (grade) {
    case 'gasoline92':
      return '92';
    case 'gasoline95':
      return '95';
    case 'diesel':
    case 'solar':
    case 'custom':
      return grade;
    default:
      return grade;
  }
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
    default: {
      const _never: never = preset;
      return _never;
    }
  }
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

export function fillUpsToCsv(rows: readonly FillUp[]): string {
  const lines = [FILL_HEADERS.join(',')];
  for (const f of rows) {
    lines.push(
      [
        f.date,
        f.odometer,
        f.liters,
        f.cost,
        f.unitPrice ?? '',
        formatFuelGradeLabel(f.fuelGrade),
        csvEscape(f.placeLabel ?? ''),
        csvEscape(f.note ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function maintenanceToCsv(rows: readonly Maintenance[]): string {
  const lines = [MAINT_HEADERS.join(',')];
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

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

function monthParts(isoMonth: string, rtl: boolean): { name: string; year: string } {
  const [year, m] = isoMonth.split('-');
  const index = Number(m) - 1;
  const name = (rtl ? MONTHS_AR : MONTHS_EN)[index] ?? m ?? '';
  return { name, year: year ?? '' };
}

function money(n: number | undefined, currency?: string): string | null {
  if (n == null || !Number.isFinite(n)) {
    return null;
  }
  const base = pdfNum(n, 2);
  return currency ? `${base} ${currency}` : base;
}

function withUnit(n: number, unit: string, digits = 0): string {
  const shown = pdfNum(n, digits);
  return unit ? `${shown} ${unit}` : shown;
}

export type MaintenancePdfOptions = {
  rtl?: boolean;
  /** Shown name (part or type). Defaults to a non-key otherLabel, else type. */
  labelFor?: (row: Maintenance) => string;
};

export type FillUpPdfOptions = {
  rtl?: boolean;
  totalKm?: number | null;
  km?: string;
  liters?: string;
};

function maintenanceLabel(row: Maintenance, labelFor?: (row: Maintenance) => string): string {
  if (labelFor) {
    return labelFor(row);
  }
  if (
    row.otherLabel &&
    !row.otherLabel.startsWith('parts.') &&
    !row.otherLabel.startsWith('maintenance.')
  ) {
    return row.otherLabel;
  }
  return row.type;
}

function groupByMonth<T extends { date: string }>(
  rows: readonly T[],
): { month: string; items: T[] }[] {
  const groups: { month: string; items: T[] }[] = [];
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) {
      last.items.push(row);
    } else {
      groups.push({ month, items: [row] });
    }
  }
  return groups;
}

function cell(value: string | null | undefined): string {
  const shown = value?.trim() ?? '';
  return shown || '—';
}

function monthLabels(copy: ExportPdfCopy): { items: string; cost: string } {
  return {
    items: copy.monthItems ?? copy.entries,
    cost: copy.monthCost ?? copy.totalCost,
  };
}

const MAINT_RATIOS = [0.11, 0.12, 0.09, 0.14, 0.1, 0.12, 0.08, 0.07, 0.08, 0.09];
const FILL_RATIOS = [0.12, 0.16, 0.12, 0.1, 0.12, 0.14, 0.1, 0.14];

function maintenanceHeaders(copy: ExportPdfCopy): string[] {
  const h = copy.columnHeaders;
  return [
    h[0] ?? '',
    copy.itemHeader ?? h[1] ?? '',
    h[3] ?? '',
    h[4] ?? '',
    h[5] ?? '',
    h[6] ?? '',
    h[8] ?? '',
    h[9] ?? '',
    h[10] ?? '',
    h[7] ?? '',
  ];
}

function maintenanceRow(row: Maintenance, opts?: MaintenancePdfOptions): string[] {
  const dueKm = row.dueKm != null && Number.isFinite(row.dueKm) ? pdfNum(row.dueKm) : '—';
  const brand = row.partBrand?.trim() || row.partModel?.trim() || '';
  return [
    pdfDate(row.date),
    cell(maintenanceLabel(row, opts?.labelFor)),
    pdfNum(row.odometer),
    money(row.cost, row.currency) ?? '—',
    dueKm,
    row.dueDate ? pdfDate(row.dueDate) : '—',
    cell(row.centerName),
    cell(row.technicianName),
    cell(brand),
    cell(row.note),
  ];
}

/** Doc definition for the maintenance PDF. Exported so tests can check layout. */
export function maintenancePdfDoc(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: MaintenancePdfOptions,
): Record<string, unknown> {
  const rtl = opts?.rtl === true;
  const ordered = [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const priced = ordered.filter((row) => row.cost != null && Number.isFinite(row.cost));
  const totalCost = priced.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const metrics = [
    { label: copy.entries, value: pdfNum(ordered.length) },
    { label: copy.totalCost, value: pdfNum(totalCost, 2) },
  ];
  if (copy.avgCost && priced.length) {
    metrics.push({ label: copy.avgCost, value: pdfNum(totalCost / priced.length, 2) });
  }
  const labels = monthLabels(copy);
  const meta = [copy.generated, copy.rangeLabel ?? ''].filter(Boolean);
  const content: Record<string, unknown>[] = [
    ...masthead(copy.title, meta, rtl),
    ...metricBand(metrics, rtl, 3),
  ];
  for (const group of groupByMonth(ordered)) {
    const monthCost = group.items.reduce(
      (sum, row) => sum + (row.cost != null && Number.isFinite(row.cost) ? row.cost : 0),
      0,
    );
    const { name, year } = monthParts(group.month, rtl);
    content.push(
      ...monthSection({
        rtl,
        month: name,
        year,
        headers: maintenanceHeaders(copy),
        ratios: MAINT_RATIOS,
        rows: group.items.map((row) => maintenanceRow(row, opts)),
        footer: {
          itemsLabel: labels.items,
          count: pdfNum(group.items.length),
          costLabel: labels.cost,
          cost: pdfNum(monthCost, 2),
          costIndex: 3,
        },
      }),
    );
  }
  return reportShell(content, rtl);
}

function fillHeaders(copy: ExportPdfCopy): string[] {
  const h = copy.columnHeaders;
  return [
    h[0] ?? '',
    h[6] ?? '',
    h[1] ?? '',
    h[2] ?? '',
    h[4] ?? '',
    h[3] ?? '',
    h[5] ?? '',
    h[7] ?? '',
  ];
}

function fillRow(row: FillUp): string[] {
  return [
    pdfDate(row.date),
    cell(row.placeLabel),
    pdfNum(row.odometer),
    pdfNum(row.liters, 1),
    row.unitPrice != null && Number.isFinite(row.unitPrice)
      ? (money(row.unitPrice, row.currency) ?? '—')
      : '—',
    money(row.cost, row.currency) ?? '—',
    cell(formatFuelGradeLabel(row.fuelGrade)),
    cell(row.note),
  ];
}

/** Doc definition for the fill-up PDF. Exported so tests can check layout. */
export function fillUpsPdfDoc(
  rows: readonly FillUp[],
  copy: ExportPdfCopy,
  opts?: FillUpPdfOptions,
): Record<string, unknown> {
  const rtl = opts?.rtl === true;
  const ordered = [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const totalCost = ordered.reduce((sum, row) => sum + row.cost, 0);
  const totalLiters = ordered.reduce((sum, row) => sum + row.liters, 0);
  const metrics: PdfFact[] = [
    { label: copy.entries, value: pdfNum(ordered.length) },
    { label: copy.totalCost, value: pdfNum(totalCost, 2) },
  ];
  if (copy.totalLiters) {
    metrics.push({
      label: copy.totalLiters,
      value: withUnit(totalLiters, opts?.liters ?? '', 1),
    });
  }
  if (opts?.totalKm != null && copy.totalKm) {
    metrics.push({
      label: copy.totalKm,
      value: withUnit(Math.round(opts.totalKm), opts?.km ?? ''),
    });
  }
  if (copy.avgPrice && totalLiters > 0) {
    metrics.push({ label: copy.avgPrice, value: pdfNum(totalCost / totalLiters, 2) });
  }
  const labels = monthLabels(copy);
  const meta = [copy.generated, copy.rangeLabel ?? ''].filter(Boolean);
  const content: Record<string, unknown>[] = [
    ...masthead(copy.title, meta, rtl),
    ...metricBand(metrics, rtl, 3),
  ];
  for (const group of groupByMonth(ordered)) {
    const monthCost = group.items.reduce((sum, row) => sum + row.cost, 0);
    const { name, year } = monthParts(group.month, rtl);
    content.push(
      ...monthSection({
        rtl,
        month: name,
        year,
        headers: fillHeaders(copy),
        ratios: FILL_RATIOS,
        rows: group.items.map((row) => fillRow(row)),
        footer: {
          itemsLabel: labels.items,
          count: pdfNum(group.items.length),
          costLabel: labels.cost,
          cost: pdfNum(monthCost, 2),
          costIndex: 5,
        },
      }),
    );
  }
  return reportShell(content, rtl);
}

export async function fillUpsToPdf(
  rows: readonly FillUp[],
  copy: ExportPdfCopy,
  opts?: FillUpPdfOptions,
): Promise<Blob> {
  return pdfBlob(fillUpsPdfDoc(rows, copy, opts));
}

export async function maintenanceToPdf(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: MaintenancePdfOptions,
): Promise<Blob> {
  return pdfBlob(maintenancePdfDoc(rows, copy, opts));
}

/** Always download — user shares from their file manager if they want. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
