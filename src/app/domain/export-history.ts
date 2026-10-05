import { todayDateOnly } from './dues';
import type { DateOnly, FillUp, FuelGrade, Maintenance } from './models';

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
  /** Localized column headers for the PDF table (CSV stays English keys). */
  columnHeaders: string[];
};

type PdfMakeApi = {
  addVirtualFileSystem?: (vfs: unknown) => void;
  vfs?: unknown;
  fonts?: Record<string, unknown>;
  createPdf: (doc: unknown) => {
    getBlob: () => Promise<Blob>;
    getBuffer?: () => Promise<Uint8Array | ArrayBuffer>;
  };
};

let pdfApi: PdfMakeApi | null = null;

async function getPdfMake(): Promise<PdfMakeApi> {
  if (pdfApi) {
    return pdfApi;
  }
  const [{ default: pdfMake }, { default: pdfVfs }] = await Promise.all([
    import('pdfmake-rtl/build/pdfmake'),
    import('pdfmake-rtl/build/vfs_fonts'),
  ]);
  const pdf = pdfMake as unknown as PdfMakeApi;
  if (typeof pdf.addVirtualFileSystem === 'function') {
    pdf.addVirtualFileSystem(pdfVfs);
  } else {
    pdf.vfs = pdfVfs;
  }
  pdf.fonts = {
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
    Cairo: {
      normal: 'Cairo-Regular.ttf',
      bold: 'Cairo-Bold.ttf',
      italics: 'Cairo-Regular.ttf',
      bolditalics: 'Cairo-Bold.ttf',
    },
  };
  pdfApi = pdf;
  return pdf;
}

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

const PDF_HEADER = '#0b3d4a';
const PDF_ACCENT = '#f5a623';
const PDF_ZEBRA = '#f3f6f8';
const PDF_TEXT = '#1a1f24';

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

function fillUpRows(rows: readonly FillUp[]): (string | number)[][] {
  return rows.map((f) => [
    f.date,
    f.odometer,
    f.liters,
    f.cost,
    f.unitPrice ?? '',
    formatFuelGradeLabel(f.fuelGrade),
    f.placeLabel ?? '',
    f.note ?? '',
  ]);
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

type PdfSpan = {
  text: string;
  font: 'Roboto' | 'Cairo';
  direction: 'ltr' | 'rtl';
  bold?: boolean;
  color?: string;
  fontSize?: number;
};

type SpanStyle = { bold?: boolean; color?: string; fontSize?: number };

/**
 * ponytail: never set doc-level `rtl: true`. pdfmake-rtl then runs Cairo's
 * digit substitution and reverses number groups (2026 → 6202), and a 13-column
 * maintenance table overflows the page so date/cost/name are clipped off.
 * Arabic letters are Cairo; digits and dates stay Roboto + direction ltr.
 * Upgrade path: a bidi engine that shapes logical Arabic without reversing digits.
 */
const PDF_TOKEN =
  /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

function pdfNum(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  });
}

function pdfDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function styledSpan(
  text: string,
  font: 'Roboto' | 'Cairo',
  direction: 'ltr' | 'rtl',
  extra?: SpanStyle,
): PdfSpan {
  const span: PdfSpan = { text, font, direction };
  if (extra?.bold === true) {
    span.bold = true;
  }
  if (extra?.color) {
    span.color = extra.color;
  }
  if (extra?.fontSize != null) {
    span.fontSize = extra.fontSize;
  }
  return span;
}

function textSpan(text: string, rtl: boolean, extra?: SpanStyle): PdfSpan {
  const arabic = rtl && hasArabic(text);
  return styledSpan(text, arabic ? 'Cairo' : 'Roboto', arabic ? 'rtl' : 'ltr', extra);
}

/** Split a mixed line so digits never share a Cairo run with Arabic letters. */
function lineSpans(text: string, rtl: boolean, extra?: SpanStyle): PdfSpan[] {
  const out: PdfSpan[] = [];
  const token = new RegExp(PDF_TOKEN.source, 'g');
  let last = 0;
  for (const match of text.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > last) {
      out.push(textSpan(text.slice(last, index), rtl, extra));
    }
    const raw = match[1] ?? '';
    const shown = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? pdfDate(raw) : raw;
    out.push(styledSpan(shown, 'Roboto', 'ltr', extra));
    last = index + raw.length;
  }
  if (last < text.length) {
    out.push(textSpan(text.slice(last), rtl, extra));
  }
  if (!out.length) {
    out.push(textSpan(text, rtl, extra));
  }
  return out;
}

function alignOf(rtl: boolean): 'right' | 'left' {
  return rtl ? 'right' : 'left';
}

function richLine(text: string, rtl: boolean, extra?: SpanStyle & { margin?: number[] }): Record<string, unknown> {
  return {
    text: lineSpans(text, rtl, extra),
    alignment: alignOf(rtl),
    margin: extra?.margin,
  };
}

function banner(copy: ExportPdfCopy, rtl: boolean): Record<string, unknown> {
  const align = alignOf(rtl);
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              {
                text: lineSpans(copy.title, rtl, { fontSize: 18, bold: true, color: '#ffffff' }),
                alignment: align,
                margin: [0, 0, 0, 4],
              },
              {
                text: lineSpans(copy.generated, rtl, { fontSize: 10, color: '#ffffff' }),
                alignment: align,
              },
            ],
            fillColor: PDF_HEADER,
            margin: [12, 10, 12, 10],
          },
        ],
      ],
    },
    layout: 'noBorders',
  };
}

function accentBar(width: number): Record<string, unknown> {
  return {
    canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: 3, color: PDF_ACCENT }],
    margin: [0, 0, 0, 12],
  };
}

function summaryBlocks(copy: ExportPdfCopy, lines: string[], rtl: boolean): Record<string, unknown>[] {
  return [
    richLine(copy.summary, rtl, { fontSize: 13, bold: true, margin: [0, 0, 0, 6] }),
    ...lines.map((line) => richLine(line, rtl, { fontSize: 10, margin: [0, 0, 0, 2] })),
  ];
}

function dataCell(
  value: string | number,
  rtl: boolean,
  opts?: SpanStyle,
): Record<string, unknown> {
  const raw = typeof value === 'number' ? String(value) : value;
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? pdfDate(raw) : raw;
  return {
    text: lineSpans(shown, rtl, opts),
    alignment: alignOf(rtl),
  };
}

function buildDocDefinition(
  copy: ExportPdfCopy,
  summaryLines: string[],
  headers: string[],
  body: (string | number)[][],
  rtl: boolean,
): Record<string, unknown> {
  const align = alignOf(rtl);
  const colCount = Math.max(headers.length, 1);
  const headersOut = rtl ? [...headers].reverse() : headers;
  const bodyOut = body.map((row) => (rtl ? [...row].reverse() : row));
  const tableBody = [
    headersOut.map((h) => dataCell(h, rtl, { bold: true, color: '#ffffff' })),
    ...bodyOut.map((row) => row.map((c) => dataCell(c, rtl))),
  ];

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 28, 28, 36],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
      color: PDF_TEXT,
      alignment: align,
    },
    content: [
      banner(copy, rtl),
      accentBar(786),
      ...summaryBlocks(copy, summaryLines, rtl),
      {
        table: {
          headerRows: 1,
          widths: Array.from({ length: colCount }, () => '*'),
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex: number) => {
            if (rowIndex === 0) {
              return PDF_HEADER;
            }
            return rowIndex % 2 === 0 ? PDF_ZEBRA : null;
          },
          hLineWidth: () => 0.4,
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8ee',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 12, 0, 0],
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#888888',
      margin: [0, 8, 0, 0],
      font: 'Roboto',
    }),
  };
}

export type MaintenancePdfOptions = {
  rtl?: boolean;
  /** Shown name (part or type). Defaults to a non-key otherLabel, else type. */
  labelFor?: (row: Maintenance) => string;
  km?: string;
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

function factSpans(label: string, value: string, rtl: boolean): PdfSpan[] {
  return [
    textSpan(`${label}: `, rtl, { fontSize: 9, color: '#667788' }),
    ...lineSpans(value, rtl, { fontSize: 9, color: '#334155' }),
  ];
}

function joinSpanGroups(groups: PdfSpan[][]): PdfSpan[] {
  const out: PdfSpan[] = [];
  for (const group of groups) {
    if (!group.length) {
      continue;
    }
    if (out.length) {
      out.push(styledSpan('  ·  ', 'Roboto', 'ltr', { fontSize: 9, color: '#99a3ad' }));
    }
    out.push(...group);
  }
  return out;
}

function maintenanceCard(
  row: Maintenance,
  label: string,
  headers: string[],
  rtl: boolean,
  km: string,
  zebra: boolean,
): Record<string, unknown> {
  const date = pdfDate(row.date);
  const cost =
    row.cost != null && Number.isFinite(row.cost) ? pdfNum(row.cost, 2) : '—';
  const unit = km ? ` ${km}` : '';
  const align = alignOf(rtl);
  const muted = { fontSize: 9, color: '#334155' };

  const dateCol = {
    width: 78,
    text: [styledSpan(date, 'Roboto', 'ltr', muted)],
    alignment: rtl ? 'right' : 'left',
  };
  const titleCol = {
    width: '*',
    text: [textSpan(label, rtl, { fontSize: 11, bold: true })],
    alignment: align,
  };
  const costCol = {
    width: 92,
    text: [styledSpan(cost, 'Roboto', 'ltr', { fontSize: 11, bold: true })],
    alignment: rtl ? 'left' : 'right',
  };

  const lines: Record<string, unknown>[] = [
    {
      columns: rtl ? [costCol, titleCol, dateCol] : [dateCol, titleCol, costCol],
      columnGap: 8,
    },
    {
      text: lineSpans(`${pdfNum(row.odometer)}${unit}`, rtl, muted),
      alignment: align,
      margin: [0, 2, 0, 0],
    },
  ];

  const due: PdfSpan[][] = [];
  const dueKm = headers[5];
  const dueDate = headers[6];
  if (row.dueKm != null && Number.isFinite(row.dueKm) && dueKm) {
    due.push(factSpans(dueKm, `${pdfNum(row.dueKm)}${unit}`, rtl));
  }
  if (row.dueDate && dueDate) {
    due.push(factSpans(dueDate, pdfDate(row.dueDate), rtl));
  }
  const dueLine = joinSpanGroups(due);
  if (dueLine.length) {
    lines.push({ text: dueLine, alignment: align, margin: [0, 1, 0, 0] });
  }
  if (row.note) {
    lines.push({
      text: lineSpans(row.note, rtl, muted),
      alignment: align,
      margin: [0, 1, 0, 0],
    });
  }

  const shop: PdfSpan[][] = [];
  const shopFields: [string | undefined, string][] = [
    [headers[8], row.centerName ?? ''],
    [headers[9], row.technicianName ?? ''],
    [headers[10], row.partBrand ?? ''],
  ];
  for (const [header, value] of shopFields) {
    if (header && value) {
      shop.push(factSpans(header, value, rtl));
    }
  }
  if (headers[11] && row.partCost != null && Number.isFinite(row.partCost)) {
    shop.push(factSpans(headers[11], pdfNum(row.partCost, 2), rtl));
  }
  if (headers[12] && row.laborCost != null && Number.isFinite(row.laborCost)) {
    shop.push(factSpans(headers[12], pdfNum(row.laborCost, 2), rtl));
  }
  const shopLine = joinSpanGroups(shop);
  if (shopLine.length) {
    lines.push({ text: shopLine, alignment: align, margin: [0, 1, 0, 0] });
  }

  return {
    unbreakable: true,
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: lines,
            fillColor: zebra ? PDF_ZEBRA : '#ffffff',
            margin: [8, 6, 8, 6],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 6],
  };
}

/** Doc definition for the maintenance PDF. Exported so tests can check layout. */
export function maintenancePdfDoc(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: MaintenancePdfOptions,
): Record<string, unknown> {
  const rtl = opts?.rtl === true;
  const km = opts?.km ?? '';
  const align = alignOf(rtl);
  const totalCost = rows.reduce((s, m) => s + (m.cost != null ? m.cost : 0), 0);
  const summary = [
    copy.rangeLabel
      ? `${copy.entries}: ${rows.length} · ${copy.rangeLabel}`
      : `${copy.entries}: ${rows.length}`,
    `${copy.totalCost}: ${pdfNum(totalCost, 2)}`,
  ];
  const cards = rows.map((row, index) =>
    maintenanceCard(
      row,
      maintenanceLabel(row, opts?.labelFor),
      copy.columnHeaders,
      rtl,
      km,
      index % 2 === 1,
    ),
  );

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [28, 28, 28, 36],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: PDF_TEXT,
      alignment: align,
    },
    content: [banner(copy, rtl), accentBar(539), ...summaryBlocks(copy, summary, rtl), ...cards],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#888888',
      margin: [0, 8, 0, 0],
      font: 'Roboto',
    }),
  };
}

async function createPdfBlob(docDefinition: Record<string, unknown>): Promise<Blob> {
  const pdf = await getPdfMake();
  const doc = pdf.createPdf(docDefinition);
  if (typeof doc.getBlob === 'function') {
    return doc.getBlob();
  }
  // Node/test fallback
  const buffer = await doc.getBuffer!();
  return new Blob([buffer as BlobPart], { type: 'application/pdf' });
}

export async function fillUpsToPdf(
  rows: readonly FillUp[],
  copy: ExportPdfCopy,
  opts?: { rtl?: boolean; totalKm?: number | null },
): Promise<Blob> {
  const rtl = opts?.rtl === true;
  const totalCost = rows.reduce((s, f) => s + f.cost, 0);
  const totalLiters = rows.reduce((s, f) => s + f.liters, 0);
  const summary = [
    copy.rangeLabel
      ? `${copy.entries}: ${rows.length} · ${copy.rangeLabel}`
      : `${copy.entries}: ${rows.length}`,
    `${copy.totalCost}: ${pdfNum(totalCost, 2)}`,
    copy.totalLiters ? `${copy.totalLiters}: ${pdfNum(totalLiters, 1)}` : '',
    opts?.totalKm != null && copy.totalKm
      ? `${copy.totalKm}: ${pdfNum(Math.round(opts.totalKm))}`
      : '',
  ].filter(Boolean);

  return createPdfBlob(
    buildDocDefinition(copy, summary, copy.columnHeaders, fillUpRows(rows), rtl),
  );
}

export async function maintenanceToPdf(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: MaintenancePdfOptions,
): Promise<Blob> {
  return createPdfBlob(maintenancePdfDoc(rows, copy, opts));
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
