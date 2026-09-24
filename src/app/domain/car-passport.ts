import { downloadFile } from './export-history';
import type { Car, FillUp, Maintenance, VehicleDocument } from './models';
import { latestEconomy, monthFuelSpend } from './economy';
import { nextExpiringDoc } from './vehicle-docs';

export type PassportCopy = {
  title: string;
  generatedPrefix: string;
  vehicle: string;
  odometer: string;
  economy: string;
  monthSpend: string;
  nextDoc: string;
  none: string;
  km: string;
  lPer100: string;
  currencyLabel: string;
  maintenance: string;
  maintEmpty: string;
  nextDocKind?: string;
  typeLabel: (type: string, otherLabel?: string) => string;
};

export type PassportData = {
  car: Car;
  fillUps: readonly FillUp[];
  documents: readonly VehicleDocument[];
  maintenance: readonly Maintenance[];
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

type PdfSpan = Record<string, unknown>;
type PdfText = string | PdfSpan | PdfSpan[];

const PDF_HEADER = '#0b3d4a';
const PDF_ACCENT = '#f5a623';
const PDF_ZEBRA = '#f3f6f8';
const PDF_TEXT = '#1a1f24';

/**
 * pdfmake-rtl treats Eastern Arabic-Indic digits (U+0660–0669) as RTL and
 * reverses them (2026 → ٦٢٠٢). Cairo also OpenType-substitutes Western→Eastern
 * via locl when used for digit runs. Passport PDF therefore: ASCII digits only,
 * always Roboto + direction:'ltr' for any glyph that is a digit. Arabic labels = Cairo.
 */
function pdfNum(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  });
}

/** dd/mm/yyyy with ASCII digits (LTR-safe). */
function pdfDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Eastern digits inside unit labels (e.g. ل/١٠٠) → ASCII. */
function unitAscii(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

async function getPdfMake(): Promise<PdfMakeApi> {
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
  return pdf;
}

/**
 * Numeric/date fragment. Font is locked to Roboto — callers must not pass Cairo;
 * Cairo locl maps 0-9 → Eastern digits, which pdfmake-rtl then reverses.
 * No U+202A/U+202C BiDi marks — Roboto has no glyphs for them (tofu boxes).
 */
function ltrNum(text: string, extra?: PdfSpan): PdfSpan {
  const rest = { ...(extra ?? {}) };
  delete rest['font'];
  return {
    ...rest,
    text,
    font: 'Roboto',
    direction: 'ltr',
  };
}

function arText(text: string, extra?: PdfSpan): PdfSpan {
  return {
    text,
    font: 'Cairo',
    direction: 'rtl',
    ...extra,
  };
}

/** Split a unit label so digits stay Roboto and Arabic letters stay Cairo. */
function unitSpans(unit: string, fontSize = 11): PdfSpan[] {
  const u = unitAscii(unit);
  const out: PdfSpan[] = [];
  for (const part of u.split(/(\d+(?:[.,]\d+)?)/)) {
    if (!part) {
      continue;
    }
    if (/^\d/.test(part)) {
      out.push(ltrNum(part, { fontSize, bold: false }));
    } else {
      out.push(arText(part, { fontSize, bold: false }));
    }
  }
  return out;
}

function cell(
  content: PdfText,
  opts: {
    bold?: boolean;
    color?: string;
    fontSize?: number;
    font?: string;
    alignment: 'left' | 'right';
    direction?: 'ltr' | 'rtl';
  },
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    bold: opts.bold === true,
    color: opts.color ?? PDF_TEXT,
    fontSize: opts.fontSize ?? 11,
    font: opts.font ?? 'Roboto',
    alignment: opts.alignment,
    noWrap: false,
  };
  if (opts.direction) {
    node['direction'] = opts.direction;
  }
  if (Array.isArray(content)) {
    node['text'] = content;
  } else if (typeof content === 'string') {
    node['text'] = content;
  } else {
    node['text'] = [content];
  }
  return node;
}

function recentMaintenance(rows: readonly Maintenance[], limit = 12): Maintenance[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, limit);
}

/** Build Car Passport PDF (no VIN). */
export async function carPassportToPdf(
  data: PassportData,
  copy: PassportCopy,
  opts: { rtl: boolean },
): Promise<Blob> {
  const eco = latestEconomy(data.fillUps);
  const monthSpend = monthFuelSpend(data.fillUps);
  const nextDoc = nextExpiringDoc(data.documents);
  const pdf = await getPdfMake();
  const ar = opts.rtl;
  const labelFont = ar ? 'Cairo' : 'Roboto';
  const align = ar ? 'right' : 'left';
  const todayIso = new Date().toISOString().slice(0, 10);

  const vehicleName = [data.car.nickname, data.car.make, data.car.model, data.car.year]
    .filter(Boolean)
    .join(' · ');

  const amountAndUnit = (amount: string, unit: string, bold = true): PdfText => {
    if (!ar) {
      return `${amount} ${unit}`;
    }
    return [
      ltrNum(amount, { bold, fontSize: 12 }),
      { text: ' ', font: 'Cairo' },
      ...unitSpans(unit, 11),
    ];
  };

  const moneyValue = (n: number): PdfText =>
    amountAndUnit(pdfNum(n, 2), copy.currencyLabel, true);

  type Row = { label: string; value: PdfText };
  const lines: Row[] = [
    {
      label: copy.vehicle,
      value: ar
        ? ltrNum(vehicleName, { bold: true, fontSize: 12 })
        : vehicleName,
    },
    {
      label: copy.odometer,
      value: amountAndUnit(pdfNum(data.car.currentOdometer), copy.km),
    },
    {
      label: copy.economy,
      value: eco
        ? amountAndUnit(pdfNum(eco.litersPer100Km, 1), copy.lPer100)
        : copy.none,
    },
    { label: copy.monthSpend, value: moneyValue(monthSpend) },
    {
      label: copy.nextDoc,
      value: nextDoc
        ? ar
          ? [
              arText(copy.nextDocKind ?? nextDoc.kind, { bold: true, fontSize: 12 }),
              { text: '  ', font: 'Cairo' },
              ltrNum(pdfDate(nextDoc.expiryDate), { bold: true, fontSize: 12 }),
            ]
          : `${copy.nextDocKind ?? nextDoc.kind}  ${pdfDate(nextDoc.expiryDate)}`
        : copy.none,
    },
  ];

  const labelCell = (label: string) =>
    cell(ar ? arText(label) : label, {
      color: '#667788',
      fontSize: 10,
      font: labelFont,
      alignment: align,
      direction: ar ? 'rtl' : undefined,
    });

  const valueCell = (value: PdfText, bold = true) => {
    if (typeof value === 'string') {
      return cell(value, {
        bold,
        fontSize: 12,
        font: 'Roboto',
        alignment: align,
        direction: 'ltr',
      });
    }
    return cell(value, {
      bold,
      fontSize: 12,
      font: labelFont,
      alignment: align,
    });
  };

  const tableBody = lines.map((row) =>
    ar
      ? [valueCell(row.value), labelCell(row.label)]
      : [labelCell(row.label), valueCell(row.value)],
  );

  const maint = recentMaintenance(data.maintenance);
  const sectionTitle = cell(ar ? arText(copy.maintenance) : copy.maintenance, {
    bold: true,
    fontSize: 13,
    font: labelFont,
    alignment: align,
    direction: ar ? 'rtl' : undefined,
  });
  sectionTitle['margin'] = [0, 20, 0, 8];

  const maintContent: Record<string, unknown>[] = [sectionTitle];

  if (maint.length === 0) {
    maintContent.push(
      cell(ar ? arText(copy.maintEmpty) : copy.maintEmpty, {
        fontSize: 10,
        color: '#667788',
        font: labelFont,
        alignment: align,
        direction: ar ? 'rtl' : undefined,
      }),
    );
  } else {
    const maintBody = maint.map((row) => {
      const kind = copy.typeLabel(row.type, row.otherLabel);

      let detail: PdfText;
      if (!ar) {
        const costStr =
          row.cost != null && Number.isFinite(row.cost)
            ? `${pdfNum(row.cost, 2)} ${copy.currencyLabel}`
            : copy.none;
        detail = `${pdfDate(row.date)}  ·  ${pdfNum(row.odometer)} ${copy.km}  ·  ${costStr}`;
      } else {
        const costPlain =
          row.cost != null && Number.isFinite(row.cost) ? pdfNum(row.cost, 2) : null;
        detail = [
          ltrNum(pdfDate(row.date), { fontSize: 10 }),
          arText(' · ', { fontSize: 10 }),
          ltrNum(pdfNum(row.odometer), { fontSize: 10 }),
          { text: ' ', font: 'Cairo' },
          ...unitSpans(copy.km, 10),
          arText(' · ', { fontSize: 10 }),
          ...(costPlain
            ? [ltrNum(costPlain, { fontSize: 10 }), { text: ' ', font: 'Cairo' }, ...unitSpans(copy.currencyLabel, 10)]
            : [arText(copy.none, { fontSize: 10 })]),
        ];
      }

      const kindC = cell(ar ? arText(kind) : kind, {
        bold: true,
        fontSize: 10,
        font: labelFont,
        alignment: align,
        direction: ar ? 'rtl' : undefined,
      });
      const detailC = cell(detail, {
        fontSize: 10,
        color: '#334155',
        font: labelFont,
        alignment: align,
      });
      return ar ? [detailC, kindC] : [kindC, detailC];
    });

    maintContent.push({
      table: {
        widths: ar ? ['*', '28%'] : ['28%', '*'],
        body: maintBody,
      },
      layout: {
        fillColor: (rowIndex: number) => (rowIndex % 2 === 0 ? PDF_ZEBRA : null),
        hLineWidth: () => 0.4,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8ee',
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
    });
  }

  const headerStack = ar
    ? [
        {
          ...arText(copy.title),
          fontSize: 20,
          bold: true,
          color: '#ffffff',
          alignment: 'right' as const,
          margin: [0, 0, 0, 6],
        },
        {
          text: [
            arText(`${copy.generatedPrefix} `, { fontSize: 10, color: '#ffffff' }),
            ltrNum(pdfDate(todayIso), { fontSize: 10, color: '#ffffff' }),
          ],
          alignment: 'right' as const,
        },
      ]
    : [
        {
          text: copy.title,
          fontSize: 20,
          bold: true,
          color: '#ffffff',
          font: 'Roboto',
          margin: [0, 0, 0, 6],
        },
        {
          text: `${copy.generatedPrefix} ${pdfDate(todayIso)}`,
          fontSize: 10,
          color: '#ffffff',
          font: 'Roboto',
        },
      ];

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 48],
    defaultStyle: {
      font: labelFont,
      fontSize: 11,
      alignment: align,
      color: PDF_TEXT,
    },
    content: [
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: headerStack,
                fillColor: PDF_HEADER,
                margin: [16, 14, 16, 14],
              },
            ],
          ],
        },
        layout: 'noBorders',
      },
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 3, color: PDF_ACCENT }],
        margin: [0, 0, 0, 20],
      },
      {
        table: {
          widths: ar ? ['*', '35%'] : ['35%', '*'],
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex % 2 === 0 ? PDF_ZEBRA : null),
          hLineWidth: () => 0.4,
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8ee',
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 10,
          paddingBottom: () => 10,
        },
      },
      ...maintContent,
    ],
    footer: () => ({
      text: 'DriveLog',
      font: 'Roboto',
      fontSize: 8,
      color: '#888888',
      alignment: align,
      margin: [40, 8, 40, 0],
    }),
  };

  const doc = pdf.createPdf(docDefinition);
  if (typeof doc.getBlob === 'function') {
    return doc.getBlob();
  }
  const buffer = await doc.getBuffer!();
  return new Blob([buffer as BlobPart], { type: 'application/pdf' });
}

export { downloadFile, pdfDate, pdfNum, unitAscii };

export async function sharePassportPdf(file: File, title: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share !== 'function') {
    downloadFile(file);
    return false;
  }
  const shareData: ShareData = { files: [file], title };
  if (typeof nav.canShare === 'function' && !nav.canShare(shareData)) {
    downloadFile(file);
    return false;
  }
  await nav.share(shareData);
  return true;
}
