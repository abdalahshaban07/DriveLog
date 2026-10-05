import { todayDateOnly } from './dues';
import type {
  DateOnly,
  FillUp,
  FuelGrade,
  Maintenance,
  MaintenanceRecordType,
  Measurement,
  PartCondition,
} from './models';
import {
  ledgerCard,
  metricBand,
  masthead,
  pdfBlob,
  pdfDate,
  pdfNum,
  reportShell,
  sectionLabel,
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
  fullTank?: string;
  yes?: string;
  distance?: string;
  partModel?: string;
  partNumber?: string;
  recordType?: string;
  condition?: string;
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

function monthTitle(iso: string, rtl: boolean): string {
  const [y, m] = iso.split('-');
  const index = Number(m) - 1;
  const name = (rtl ? MONTHS_AR : MONTHS_EN)[index] ?? m;
  return `${name} ${y ?? ''}`.trim();
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
  km?: string;
  formatRecordType?: (type: MaintenanceRecordType) => string;
  formatCondition?: (condition: PartCondition) => string;
  measurementLabel?: (measurement: Measurement) => string;
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

function pushFact(
  facts: PdfFact[],
  label: string | undefined,
  value: string | null | undefined,
): void {
  if (label && value) {
    facts.push({ label, value });
  }
}

function maintenanceFacts(
  row: Maintenance,
  headers: string[],
  copy: ExportPdfCopy,
  opts: MaintenancePdfOptions | undefined,
  km: string,
): PdfFact[] {
  const facts: PdfFact[] = [];
  const dueKm = headers[5];
  const dueDate = headers[6];
  if (row.dueKm != null && Number.isFinite(row.dueKm)) {
    pushFact(facts, dueKm, withUnit(row.dueKm, km));
  }
  if (row.dueDate) {
    pushFact(facts, dueDate, pdfDate(row.dueDate));
  }
  pushFact(facts, headers[8], row.centerName);
  pushFact(facts, headers[9], row.technicianName);
  pushFact(facts, headers[10], row.partBrand);
  pushFact(facts, copy.partModel, row.partModel);
  pushFact(facts, copy.partNumber, row.partNumber);
  if (row.recordType && opts?.formatRecordType) {
    pushFact(facts, copy.recordType, opts.formatRecordType(row.recordType));
  }
  if (row.condition && opts?.formatCondition) {
    pushFact(facts, copy.condition, opts.formatCondition(row.condition));
  }
  for (const reading of row.measurements ?? []) {
    const label = opts?.measurementLabel?.(reading) ?? reading.type;
    const digits = Number.isInteger(reading.value) ? 0 : 2;
    const value = [pdfNum(reading.value, digits), reading.unit].filter(Boolean).join(' ');
    pushFact(facts, label, value);
  }
  pushFact(facts, headers[11], money(row.partCost, row.currency));
  pushFact(facts, headers[12], money(row.laborCost, row.currency));
  for (const observation of row.observations ?? []) {
    const raw = observation.value == null ? '' : String(observation.value);
    const value = observation.unit ? `${raw} ${observation.unit}` : raw;
    pushFact(facts, observation.type, value);
  }
  return facts;
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

function maintenanceCard(
  row: Maintenance,
  label: string,
  copy: ExportPdfCopy,
  opts: MaintenancePdfOptions | undefined,
  km: string,
  rtl: boolean,
): Record<string, unknown> {
  const cost = money(row.cost, row.currency);
  const headers = copy.columnHeaders;
  return ledgerCard({
    rtl,
    kicker: pdfDate(row.date),
    title: label,
    amount: cost ?? '—',
    amountColor: cost ? '#e8a317' : '#6b6358',
    subtitle: withUnit(row.odometer, km),
    facts: maintenanceFacts(row, headers, copy, opts, km),
    note: row.note ? { label: headers[7], text: row.note } : undefined,
  });
}

/** Doc definition for the maintenance PDF. Exported so tests can check layout. */
export function maintenancePdfDoc(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: MaintenancePdfOptions,
): Record<string, unknown> {
  const rtl = opts?.rtl === true;
  const km = opts?.km ?? '';
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
  const meta = [copy.generated, copy.rangeLabel ?? ''].filter(Boolean);
  const content: Record<string, unknown>[] = [
    ...masthead(copy.title, meta, rtl),
    ...metricBand(metrics, rtl, 3),
  ];
  for (const group of groupByMonth(ordered)) {
    const monthCost = group.items.reduce((sum, row) => sum + (row.cost != null ? row.cost : 0), 0);
    const heading = monthTitle(`${group.month}-01`, rtl);
    content.push(sectionLabel(monthCost ? `${heading}   ${pdfNum(monthCost, 2)}` : heading, rtl));
    for (const row of group.items) {
      content.push(
        maintenanceCard(row, maintenanceLabel(row, opts?.labelFor), copy, opts, km, rtl),
      );
    }
  }
  return reportShell(content, rtl);
}

function fillUpCard(
  row: FillUp,
  copy: ExportPdfCopy,
  opts: FillUpPdfOptions | undefined,
  rtl: boolean,
): Record<string, unknown> {
  const headers = copy.columnHeaders;
  const grade = formatFuelGradeLabel(row.fuelGrade);
  const place = row.placeLabel?.trim() ?? '';
  const facts: PdfFact[] = [];
  pushFact(facts, headers[2], withUnit(row.liters, opts?.liters ?? '', 1));
  if (row.unitPrice != null && Number.isFinite(row.unitPrice)) {
    pushFact(facts, headers[4], money(row.unitPrice, row.currency));
  }
  if (place && grade) {
    pushFact(facts, headers[5], grade);
  }
  if (row.distanceKm != null && Number.isFinite(row.distanceKm)) {
    pushFact(facts, copy.distance, withUnit(row.distanceKm, opts?.km ?? ''));
  }
  if (row.tankFull && copy.fullTank && copy.yes) {
    pushFact(facts, copy.fullTank, copy.yes);
  }
  const cost = money(row.cost, row.currency);
  return ledgerCard({
    rtl,
    kicker: pdfDate(row.date),
    title: place || grade || '—',
    amount: cost ?? '—',
    amountColor: cost ? '#e8a317' : '#6b6358',
    subtitle: withUnit(row.odometer, opts?.km ?? ''),
    facts,
    note: row.note ? { label: headers[7], text: row.note } : undefined,
  });
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
  const meta = [copy.generated, copy.rangeLabel ?? ''].filter(Boolean);
  const content: Record<string, unknown>[] = [
    ...masthead(copy.title, meta, rtl),
    ...metricBand(metrics, rtl, 3),
  ];
  for (const group of groupByMonth(ordered)) {
    const monthCost = group.items.reduce((sum, row) => sum + row.cost, 0);
    const heading = monthTitle(`${group.month}-01`, rtl);
    content.push(sectionLabel(`${heading}   ${pdfNum(monthCost, 2)}`, rtl));
    for (const row of group.items) {
      content.push(fillUpCard(row, copy, opts, rtl));
    }
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
