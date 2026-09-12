import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
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
};

const FILL_HEADERS = [
  'date',
  'odometer',
  'liters',
  'cost',
  'unitPrice',
  'fuelGrade',
  'tankFull',
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

function sheetToBlob(sheet: XLSX.WorkSheet, sheetName: string): Blob {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function fillUpRows(rows: readonly FillUp[]): (string | number)[][] {
  return rows.map((f) => [
    f.date,
    f.odometer,
    f.liters,
    f.cost,
    f.unitPrice ?? '',
    f.fuelGrade ?? '',
    f.tankFull ? 1 : 0,
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

export function fillUpsToXlsx(rows: readonly FillUp[]): Blob {
  const sheet = XLSX.utils.aoa_to_sheet([FILL_HEADERS.slice(), ...fillUpRows(rows)]);
  return sheetToBlob(sheet, 'Fill-ups');
}

export function maintenanceToXlsx(rows: readonly Maintenance[]): Blob {
  const sheet = XLSX.utils.aoa_to_sheet([MAINT_HEADERS.slice(), ...maintenanceRows(rows)]);
  return sheetToBlob(sheet, 'Maintenance');
}

function drawPdfChrome(
  doc: jsPDF,
  copy: ExportPdfCopy,
  summaryLines: string[],
  rtl: boolean,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(PDF_HEADER);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setFillColor(PDF_ACCENT);
  doc.rect(0, 36, pageW, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const titleX = rtl ? pageW - 14 : 14;
  doc.text(copy.title, titleX, 16, { align: rtl ? 'right' : 'left' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(copy.generated, titleX, 26, { align: rtl ? 'right' : 'left' });

  let y = 48;
  doc.setTextColor(PDF_TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(copy.summary, titleX, y, { align: rtl ? 'right' : 'left' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const line of summaryLines) {
    doc.text(line, titleX, y, { align: rtl ? 'right' : 'left' });
    y += 6;
  }
  return y + 4;
}

function finishPdf(doc: jsPDF): Blob {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${i} / ${pageCount}`, pageW / 2, pageH - 8, { align: 'center' });
  }
  return doc.output('blob');
}

export function fillUpsToPdf(
  rows: readonly FillUp[],
  copy: ExportPdfCopy,
  opts?: { rtl?: boolean; totalKm?: number | null },
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rtl = opts?.rtl === true;
  const totalCost = rows.reduce((s, f) => s + f.cost, 0);
  const totalLiters = rows.reduce((s, f) => s + f.liters, 0);
  const summary = [
    copy.rangeLabel ? `${copy.entries}: ${rows.length} · ${copy.rangeLabel}` : `${copy.entries}: ${rows.length}`,
    `${copy.totalCost}: ${totalCost.toFixed(2)}`,
    copy.totalLiters ? `${copy.totalLiters}: ${totalLiters.toFixed(1)}` : '',
    opts?.totalKm != null && copy.totalKm ? `${copy.totalKm}: ${Math.round(opts.totalKm)}` : '',
  ].filter(Boolean);

  const startY = drawPdfChrome(doc, copy, summary, rtl);
  autoTable(doc, {
    startY,
    head: [FILL_HEADERS.slice()],
    body: fillUpRows(rows),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: PDF_TEXT,
      cellPadding: 2,
      halign: rtl ? 'right' : 'left',
    },
    headStyles: {
      fillColor: PDF_HEADER,
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: PDF_ZEBRA },
    margin: { left: 14, right: 14 },
  });
  return finishPdf(doc);
}

export function maintenanceToPdf(
  rows: readonly Maintenance[],
  copy: ExportPdfCopy,
  opts?: { rtl?: boolean },
): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rtl = opts?.rtl === true;
  const totalCost = rows.reduce((s, m) => s + m.cost, 0);
  const summary = [
    copy.rangeLabel ? `${copy.entries}: ${rows.length} · ${copy.rangeLabel}` : `${copy.entries}: ${rows.length}`,
    `${copy.totalCost}: ${totalCost.toFixed(2)}`,
  ];

  const startY = drawPdfChrome(doc, copy, summary, rtl);
  autoTable(doc, {
    startY,
    head: [MAINT_HEADERS.slice()],
    body: maintenanceRows(rows),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: PDF_TEXT,
      cellPadding: 2,
      halign: rtl ? 'right' : 'left',
    },
    headStyles: {
      fillColor: PDF_HEADER,
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: PDF_ZEBRA },
    margin: { left: 14, right: 14 },
  });
  return finishPdf(doc);
}

export async function shareOrDownloadFile(file: File, title: string): Promise<void> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
