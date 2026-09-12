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

function maintenanceRows(rows: readonly Maintenance[]): (string | number)[][] {
  return rows.map((m) => [
    m.date,
    m.type,
    m.otherLabel ?? '',
    m.odometer,
    m.cost,
    m.dueKm ?? '',
    m.dueDate ?? '',
    m.note ?? '',
    m.centerName ?? '',
    m.technicianName ?? '',
    m.partBrand ?? '',
    m.partCost ?? '',
    m.laborCost ?? '',
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

function cell(text: string | number, opts?: { bold?: boolean; color?: string }): Record<string, unknown> {
  return {
    text: String(text),
    bold: opts?.bold === true,
    color: opts?.color,
    noWrap: false,
  };
}

function buildDocDefinition(
  copy: ExportPdfCopy,
  summaryLines: string[],
  headers: string[],
  body: (string | number)[][],
  rtl: boolean,
): Record<string, unknown> {
  const font = rtl ? 'Cairo' : 'Roboto';
  const align = rtl ? 'right' : 'left';
  const colCount = Math.max(headers.length, 1);
  const widths = Array.from({ length: colCount }, () => '*');

  const tableBody = [
    headers.map((h) =>
      cell(h, { bold: true, color: '#ffffff' }),
    ),
    ...body.map((row) => row.map((c) => cell(c))),
  ];

  return {
    pageOrientation: 'landscape',
    pageMargins: [28, 28, 28, 36],
    // pdfmake-rtl: forces RTL layout + Cairo for Arabic
    ...(rtl ? { rtl: true } : {}),
    defaultStyle: {
      font,
      fontSize: 9,
      color: PDF_TEXT,
      alignment: align,
    },
    content: [
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: copy.title, fontSize: 18, bold: true, color: '#ffffff', margin: [0, 0, 0, 4] },
                  { text: copy.generated, fontSize: 10, color: '#ffffff' },
                ],
                fillColor: PDF_HEADER,
                margin: [12, 10, 12, 10],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 0],
      },
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 785, h: 3, color: PDF_ACCENT }],
        margin: [0, 0, 0, 12],
      },
      { text: copy.summary, fontSize: 13, bold: true, margin: [0, 0, 0, 6] },
      ...summaryLines.map((line) => ({
        text: line,
        fontSize: 10,
        margin: [0, 0, 0, 2],
      })),
      {
        table: {
          headerRows: 1,
          widths,
          ...(rtl ? { rtl: true } : {}),
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
    `${copy.totalCost}: ${totalCost.toFixed(2)}`,
    copy.totalLiters ? `${copy.totalLiters}: ${totalLiters.toFixed(1)}` : '',
    opts?.totalKm != null && copy.totalKm
      ? `${copy.totalKm}: ${Math.round(opts.totalKm)}`
      : '',
  ].filter(Boolean);

  return createPdfBlob(
    buildDocDefinition(copy, summary, copy.columnHeaders, fillUpRows(rows), rtl),
  );
}

export async function maintenanceToPdf(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: { rtl?: boolean },
): Promise<Blob> {
  const rtl = opts?.rtl === true;
  const totalCost = rows.reduce((s, m) => s + m.cost, 0);
  const summary = [
    copy.rangeLabel
      ? `${copy.entries}: ${rows.length} · ${copy.rangeLabel}`
      : `${copy.entries}: ${rows.length}`,
    `${copy.totalCost}: ${totalCost.toFixed(2)}`,
  ];

  return createPdfBlob(
    buildDocDefinition(copy, summary, copy.columnHeaders, maintenanceRows(rows), rtl),
  );
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
