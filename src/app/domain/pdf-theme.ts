import pdfMake from 'pdfmake-rtl/build/pdfmake';
import pdfVfs from 'pdfmake-rtl/build/vfs_fonts';

/**
 * Shared print chrome for every DriveLog PDF.
 * Night Receipt on paper: ink masthead, amber rule, metric tiles, rail cards.
 *
 * ponytail: never set doc-level `rtl: true`. pdfmake-rtl then runs Cairo's
 * digit substitution and reverses number groups (2026 → 6202). Arabic letters
 * are Cairo; digits and dates stay Roboto + direction ltr.
 * Upgrade path: a bidi engine that shapes logical Arabic without reversing digits.
 */

export const PDF = {
  ink: '#1c1a17',
  paper: '#f6f1e8',
  card: '#fffdf8',
  well: '#f3ece1',
  amber: '#e8a317',
  text: '#1a1814',
  muted: '#6b6358',
  faint: '#8a8175',
  hair: '#e4d8c8',
  white: '#ffffff',
  onInk: '#d9cfc2',
} as const;

const PAGE_W = 595.28;
const MARGIN_X = 32;

export function contentWidth(): number {
  return PAGE_W - MARGIN_X * 2;
}

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

function getPdfMake(): PdfMakeApi {
  if (pdfApi) {
    return pdfApi;
  }
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

export async function pdfBlob(docDefinition: Record<string, unknown>): Promise<Blob> {
  const doc = getPdfMake().createPdf(docDefinition);
  if (typeof doc.getBlob === 'function') {
    return doc.getBlob();
  }
  const buffer = await doc.getBuffer!();
  return new Blob([buffer as BlobPart], { type: 'application/pdf' });
}

export type PdfSpan = {
  text: string;
  font: 'Roboto' | 'Cairo';
  direction: 'ltr' | 'rtl';
  bold?: boolean;
  color?: string;
  fontSize?: number;
  characterSpacing?: number;
};

type SpanStyle = {
  bold?: boolean;
  color?: string;
  fontSize?: number;
  characterSpacing?: number;
};

const PDF_TOKEN =
  /([+-]?\d{4}-\d{2}-\d{2}|[+-]?\d{2}\/\d{2}\/\d{4}|[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|[+-]?\d+(?:\.\d+)?%?)/g;

export function pdfNum(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  });
}

export function pdfDate(iso: string): string {
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
  if (extra?.characterSpacing != null) {
    span.characterSpacing = extra.characterSpacing;
  }
  return span;
}

/** Latin letters must leave the Arabic run or pdfmake reorders them (حساس O2 → Oحساس). */
function pushPlain(text: string, rtl: boolean, extra: SpanStyle | undefined, out: PdfSpan[]): void {
  for (const bit of text.split(/([A-Za-z]+)/)) {
    if (bit) {
      out.push(textSpan(bit, rtl, extra));
    }
  }
}

function textSpan(text: string, rtl: boolean, extra?: SpanStyle): PdfSpan {
  const arabic = rtl && hasArabic(text);
  return styledSpan(text, arabic ? 'Cairo' : 'Roboto', arabic ? 'rtl' : 'ltr', extra);
}

function sameRun(a: PdfSpan, b: PdfSpan): boolean {
  return (
    a.font === b.font &&
    a.direction === b.direction &&
    a.bold === b.bold &&
    a.color === b.color &&
    a.fontSize === b.fontSize &&
    a.characterSpacing === b.characterSpacing
  );
}

/**
 * Adjacent LTR pieces (a date, a dash, another date) must stay one run.
 * Separate runs inside an RTL line get reordered (01/01 then 05/10 swaps).
 */
function mergeRuns(spans: PdfSpan[]): PdfSpan[] {
  const out: PdfSpan[] = [];
  for (const span of spans) {
    const prev = out[out.length - 1];
    if (prev && sameRun(prev, span)) {
      prev.text += span.text;
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

/** Split a mixed line so digits never share a Cairo run with Arabic letters. */
export function lineSpans(text: string, rtl: boolean, extra?: SpanStyle): PdfSpan[] {
  const out: PdfSpan[] = [];
  const token = new RegExp(PDF_TOKEN.source, 'g');
  let last = 0;
  for (const match of text.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > last) {
      pushPlain(text.slice(last, index), rtl, extra, out);
    }
    const raw = match[1] ?? '';
    const shown = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? pdfDate(raw) : raw;
    out.push(styledSpan(shown, 'Roboto', 'ltr', extra));
    last = index + raw.length;
  }
  if (last < text.length) {
    pushPlain(text.slice(last), rtl, extra, out);
  }
  if (!out.length) {
    out.push(textSpan(text, rtl, extra));
  }
  return mergeRuns(out);
}

/**
 * Mixed Arabic + numbers cannot share one pdfmake line: digit-only runs are
 * treated as neutral and get swapped (01/01 - 05/10, or ل/100).
 * Each run becomes its own column so the library never reorders them.
 * ponytail: a mixed line does not wrap. Upgrade path: a bidi engine.
 */
export function flowText(
  text: string,
  rtl: boolean,
  extra?: SpanStyle & { margin?: number[] },
): Record<string, unknown> {
  const spans = lineSpans(text, rtl, extra);
  const margin = extra?.margin;
  const mixed =
    spans.some((span) => span.direction === 'rtl') &&
    spans.some((span) => span.direction === 'ltr');
  if (!mixed) {
    return { text: spans, alignment: alignOf(rtl), margin };
  }
  const cols: Record<string, unknown>[] = spans.map((span) => ({
    width: 'auto',
    text: [span],
    noWrap: true,
    alignment: span.direction === 'rtl' ? 'right' : 'left',
  }));
  const ordered = rtl ? [...cols].reverse() : cols;
  if (rtl) {
    ordered.unshift({ width: '*', text: '' });
  }
  return { columns: ordered, columnGap: 0, margin };
}

export function alignOf(rtl: boolean): 'right' | 'left' {
  return rtl ? 'right' : 'left';
}

export function richLine(
  text: string,
  rtl: boolean,
  extra?: SpanStyle & { margin?: number[] },
): Record<string, unknown> {
  return flowText(text, rtl, extra);
}

export type PdfMetric = { label: string; value: string };

export function reportShell(
  content: Record<string, unknown>[],
  rtl: boolean,
): Record<string, unknown> {
  const align = alignOf(rtl);
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGIN_X, 28, MARGIN_X, 44],
    background: (_page: number, pageSize: { width: number; height: number }) => ({
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: pageSize.width,
          h: pageSize.height,
          color: PDF.paper,
        },
      ],
    }),
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: PDF.text,
      alignment: align,
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [MARGIN_X, 8, MARGIN_X, 0],
      columns: [
        {
          width: '*',
          text: 'DriveLog',
          font: 'Roboto',
          fontSize: 8,
          color: PDF.faint,
          alignment: 'left',
        },
        {
          width: 'auto',
          text: `${currentPage}  /  ${pageCount}`,
          font: 'Roboto',
          fontSize: 8,
          color: PDF.faint,
          alignment: 'right',
        },
      ],
    }),
  };
}

export function masthead(
  title: string,
  meta: string[],
  rtl: boolean,
  kicker?: string,
): Record<string, unknown>[] {
  const align = alignOf(rtl);
  const lines: Record<string, unknown>[] = [
    {
      text: 'DRIVELOG',
      font: 'Roboto',
      fontSize: 8,
      bold: true,
      characterSpacing: 2.6,
      color: PDF.amber,
      alignment: align,
    },
  ];
  if (kicker) {
    lines.push(flowText(kicker, rtl, { fontSize: 9, color: PDF.onInk, margin: [0, 8, 0, 0] }));
  }
  lines.push(
    flowText(title, rtl, {
      fontSize: 22,
      bold: true,
      color: PDF.white,
      margin: [0, kicker ? 2 : 8, 0, 0],
    }),
  );
  for (const line of meta) {
    if (!line) {
      continue;
    }
    lines.push(flowText(line, rtl, { fontSize: 9, color: PDF.onInk, margin: [0, 3, 0, 0] }));
  }
  return [
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: lines,
              fillColor: PDF.ink,
              margin: [16, 16, 16, 14],
            },
          ],
        ],
      },
      layout: 'noBorders',
    },
    {
      canvas: [{ type: 'rect', x: 0, y: 0, w: contentWidth(), h: 3, color: PDF.amber }],
      margin: [0, 0, 0, 14],
    },
  ];
}

function metricStrip(items: PdfMetric[], rtl: boolean): Record<string, unknown> {
  const cells = items.map((item) => ({
    stack: [
      flowText(item.label, rtl, { fontSize: 8, color: PDF.muted }),
      flowText(item.value, rtl, {
        fontSize: 14,
        bold: true,
        color: PDF.text,
        margin: [0, 3, 0, 0],
      }),
    ],
    fillColor: PDF.card,
    margin: [8, 8, 8, 8],
  }));
  const ordered = rtl ? [...cells].reverse() : cells;
  return {
    table: {
      widths: ordered.map(() => '*'),
      body: [ordered],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === node.table.body.length ? 2 : 0,
      hLineColor: () => PDF.amber,
      vLineWidth: (i: number) => (i === 0 || i === ordered.length ? 0 : 6),
      vLineColor: () => PDF.paper,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 6],
  };
}

/** Metric tiles, wrapped so a row never holds more than `perRow` figures. */
export function metricBand(
  items: PdfMetric[],
  rtl: boolean,
  perRow = 3,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i += perRow) {
    out.push(metricStrip(items.slice(i, i + perRow), rtl));
  }
  return out;
}

export function sectionLabel(text: string, rtl: boolean): Record<string, unknown> {
  const mark = {
    width: 8,
    canvas: [{ type: 'rect', x: 0, y: 3, w: 3, h: 12, color: PDF.amber }],
  };
  const label = {
    width: '*',
    ...flowText(text, rtl, { fontSize: 12, bold: true, color: PDF.text }),
  };
  return {
    columns: rtl ? [label, mark] : [mark, label],
    columnGap: 4,
    margin: [0, 12, 0, 8],
  };
}

export type PdfFact = { label: string; value: string };

function factCell(fact: PdfFact, rtl: boolean): Record<string, unknown> {
  return {
    stack: [
      flowText(fact.label, rtl, { fontSize: 8, color: PDF.muted }),
      flowText(fact.value, rtl, {
        fontSize: 10,
        bold: true,
        color: PDF.text,
        margin: [0, 2, 0, 0],
      }),
    ],
    fillColor: PDF.well,
    margin: [8, 6, 8, 6],
  };
}

export function factGrid(facts: PdfFact[], rtl: boolean): Record<string, unknown> | null {
  if (!facts.length) {
    return null;
  }
  const blank = { text: '', fillColor: PDF.card };
  const body: Record<string, unknown>[][] = [];
  const wide = (fact: PdfFact): Record<string, unknown>[] => {
    const cell = factCell(fact, rtl);
    cell['colSpan'] = 2;
    return [cell, { text: '' }];
  };
  let i = 0;
  while (i < facts.length) {
    const fact = facts[i]!;
    if (fact.value.length > 24) {
      body.push(wide(fact));
      i += 1;
      continue;
    }
    const next = facts[i + 1];
    if (next && next.value.length > 24) {
      body.push(rtl ? [blank, factCell(fact, rtl)] : [factCell(fact, rtl), blank]);
      i += 1;
      continue;
    }
    const left = factCell(fact, rtl);
    const right = next ? factCell(next, rtl) : blank;
    body.push(rtl ? [right, left] : [left, right]);
    i += next ? 2 : 1;
  }
  return {
    table: { widths: ['*', '*'], body },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 0 : 4,
      vLineWidth: (i: number) => (i === 1 ? 4 : 0),
      hLineColor: () => PDF.card,
      vLineColor: () => PDF.card,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 8, 0, 0],
  };
}

export function ledgerCard(opts: {
  rtl: boolean;
  kicker: string;
  title: string;
  amount: string;
  amountColor?: string;
  subtitle?: string;
  facts?: PdfFact[];
  note?: { label?: string; text: string };
}): Record<string, unknown> {
  const kicker = {
    width: '*',
    ...flowText(opts.kicker, opts.rtl, { fontSize: 9, color: PDF.muted }),
  };
  const amount = {
    width: 'auto',
    ...flowText(opts.amount, opts.rtl, {
      fontSize: 13,
      bold: true,
      color: opts.amountColor ?? PDF.text,
    }),
  };
  const stack: Record<string, unknown>[] = [
    { columns: opts.rtl ? [amount, kicker] : [kicker, amount], columnGap: 8 },
    flowText(opts.title, opts.rtl, {
      fontSize: 13,
      bold: true,
      color: PDF.text,
      margin: [0, 3, 0, 0],
    }),
  ];
  if (opts.subtitle) {
    stack.push(
      flowText(opts.subtitle, opts.rtl, { fontSize: 9, color: PDF.muted, margin: [0, 2, 0, 0] }),
    );
  }
  const grid = opts.facts?.length ? factGrid(opts.facts, opts.rtl) : null;
  if (grid) {
    stack.push(grid);
  }
  if (opts.note?.text) {
    if (opts.note.label) {
      stack.push(
        flowText(opts.note.label, opts.rtl, {
          fontSize: 8,
          color: PDF.muted,
          margin: [0, 8, 0, 2],
        }),
      );
    }
    stack.push(
      flowText(opts.note.text, opts.rtl, {
        fontSize: 10,
        color: PDF.text,
        margin: [0, opts.note.label ? 0 : 6, 0, 0],
      }),
    );
  }

  const rail = { text: '', fillColor: PDF.amber };
  const body = { stack, fillColor: PDF.card, margin: [12, 10, 12, 10] };
  return {
    unbreakable: true,
    table: {
      widths: opts.rtl ? ['*', 4] : [4, '*'],
      body: [opts.rtl ? [body, rail] : [rail, body]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 8],
  };
}

export type MonthFooter = {
  itemsLabel: string;
  count: string;
  costLabel: string;
  cost: string;
  /** Cost column in reading order, before an RTL table is flipped. */
  costIndex: number;
};

function fitWidths(ratios: number[], costIndex: number): number[] {
  const total = contentWidth() - 8;
  const widths = ratios.map((ratio) => Math.floor(total * ratio));
  const used = widths.reduce((sum, width) => sum + width, 0);
  const cost = widths[costIndex] ?? 0;
  widths[costIndex] = cost + (total - used);
  return widths;
}

function paintCell(
  text: string,
  rtl: boolean,
  fill: string,
  header: boolean,
): Record<string, unknown> {
  const size = header ? 6.5 : 7;
  const arabic = hasArabic(text);
  const digits = /\d/.test(text);
  const color = text === '—' ? PDF.muted : header ? PDF.ink : PDF.text;
  if (arabic && digits) {
    const flowed = flowText(text, rtl, { fontSize: size, bold: header, color });
    delete flowed['margin'];
    return { ...flowed, fillColor: fill };
  }
  return {
    text,
    font: arabic ? 'Cairo' : 'Roboto',
    fontSize: size,
    bold: header,
    color,
    fillColor: fill,
    alignment: alignOf(rtl),
    noWrap: !header && !arabic && (digits || text === '—'),
    margin: [0, 1, 0, 1],
  };
}

function footerStat(
  label: string,
  value: string,
  rtl: boolean,
  fill: string,
): Record<string, unknown> {
  const align = alignOf(rtl);
  const arabic = hasArabic(label);
  return {
    stack: [
      {
        text: label,
        font: arabic ? 'Cairo' : 'Roboto',
        fontSize: 6.5,
        color: PDF.muted,
        alignment: align,
      },
      {
        text: value,
        font: 'Roboto',
        fontSize: 10,
        bold: true,
        color: PDF.text,
        alignment: align,
        noWrap: true,
        margin: [0, 1, 0, 0],
      },
    ],
    fillColor: fill,
  };
}

function spanCells(cell: Record<string, unknown>, count: number): Record<string, unknown>[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [cell];
  }
  const fill = cell['fillColor'];
  const blanks = Array.from({ length: count - 1 }, () => ({ text: '', fillColor: fill }));
  return [{ ...cell, colSpan: count }, ...blanks];
}

function monthFooterRow(
  columnCount: number,
  footer: MonthFooter,
  rtl: boolean,
): Record<string, unknown>[] {
  const items = footerStat(footer.itemsLabel, footer.count, rtl, PDF.card);
  const cost = footerStat(footer.costLabel, footer.cost, rtl, PDF.well);
  const empty = { text: '', fillColor: PDF.card };
  const before = footer.costIndex;
  const after = columnCount - footer.costIndex - 1;
  // Logical order. pdfmake-rtl flips an `rtl` table once, colSpan groups included.
  return [...spanCells(items, before), cost, ...spanCells(empty, after)];
}

function monthBand(month: string, year: string, rtl: boolean): Record<string, unknown> {
  const name = {
    width: 'auto',
    text: [
      {
        text: month,
        font: hasArabic(month) ? 'Cairo' : 'Roboto',
        fontSize: 10,
        bold: true,
        color: PDF.white,
      },
    ],
    noWrap: true,
  };
  const y = {
    width: 'auto',
    text: [{ text: year, font: 'Roboto', fontSize: 10, bold: true, color: PDF.amber }],
    noWrap: true,
  };
  const cols = rtl
    ? [{ width: '*', text: '' }, y, { width: 6, text: '' }, name]
    : [name, { width: 6, text: '' }, y];
  return {
    table: {
      widths: ['*'],
      body: [[{ columns: cols, columnGap: 0, fillColor: PDF.ink, margin: [6, 4, 6, 3] }]],
    },
    layout: 'noBorders',
    margin: [0, 8, 0, 0],
  };
}

/** One month: ink title, then a table whose last row closes the cost column. */
export function monthSection(opts: {
  rtl: boolean;
  month: string;
  year: string;
  headers: string[];
  ratios: number[];
  rows: string[][];
  footer: MonthFooter;
}): Record<string, unknown>[] {
  const count = opts.headers.length;
  const headerFill = PDF.well;
  const header = opts.headers.map((label) => paintCell(label, opts.rtl, headerFill, true));
  const body = opts.rows.map((row, index) => {
    const fill = index % 2 === 0 ? PDF.card : '#fbf7f1';
    return row.map((value) => paintCell(value || '—', opts.rtl, fill, false));
  });
  const footer = monthFooterRow(count, opts.footer, opts.rtl);
  const table: Record<string, unknown> = {
    headerRows: 1,
    widths: fitWidths(opts.ratios, opts.footer.costIndex),
    dontBreakRows: true,
    body: [header, ...body, footer],
  };
  // One flip inside pdfmake, including colSpan. A hand-flipped body gets
  // flipped again when enough cells are Arabic, and months disagree.
  if (opts.rtl) {
    table['rtl'] = true;
  }
  return [
    monthBand(opts.month, opts.year, opts.rtl),
    {
      table,
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => {
          if (i === 0 || i === node.table.body.length) {
            return 0;
          }
          if (i === 1 || i === node.table.body.length - 1) {
            return 1.25;
          }
          return 0.4;
        },
        hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
          i === 1 || i === node.table.body.length - 1 ? PDF.amber : PDF.hair,
        vLineWidth: () => 0,
        paddingLeft: () => 2,
        paddingRight: () => 2,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
      margin: [0, 0, 0, 2],
    },
  ];
}
