/** Parse fuel receipt OCR text into candidate fields (EN-first heuristics). */

export type ReceiptCandidates = {
  liters: number[];
  unitPrice: number[];
  total: number[];
  raw: string;
  /** Numbers sitting next to a liter / price / sale word. */
  labels: {
    liters: number[];
    unitPrice: number[];
    total: number[];
  };
};

export type ReceiptPick = {
  liters?: number;
  unitPrice?: number;
  total?: number;
};

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,3})?)`;
const LITER = String.raw`liters?|ltr|ltrs|volume|كمية|لتر`;
const PRICE = String.raw`price|unit|per\s*l|/\s*l|سعر`;
const TOTAL = String.raw`total|amount|sum|sale|الإجمالي|المجموع`;

/** Arabic-Indic and Persian digits → ASCII so labeled regexes can see them. */
function westernDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
}

/** Drop the camera stamp and "1. Remove the nozzle" so they are not fill-up numbers. */
function stripNoise(raw: string): string {
  return raw
    .replace(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
      ' ',
    )
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, ' ')
    .replace(/(?:^|\n)[ \t]*\d{1,2}\.[ \t]+/g, '\n');
}

function toNum(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function uniqSorted(nums: number[]): number[] {
  return [...new Set(nums.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
}

function collect(re: RegExp, text: string, sink: number[], marked: number[]): void {
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((m = r.exec(text)) !== null) {
    const n = toNum(m[1] ?? '');
    if (n != null && n > 0) {
      sink.push(n);
      marked.push(n);
    }
  }
}

/** Word then number, and number then word (pump LCDs print `35.010 LITER`). */
function around(words: string, text: string, sink: number[], marked: number[]): void {
  collect(new RegExp(`(?:${words})\\s*[:=]?\\s*${NUM}`, 'gi'), text, sink, marked);
  collect(new RegExp(`${NUM}\\s*[:=]?\\s*(?:${words})`, 'gi'), text, sink, marked);
}

/** Extract candidate liters / unit price / totals from OCR text. */
export function parseReceiptText(raw: string): ReceiptCandidates {
  const text = stripNoise(westernDigits(raw)).replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const liters: number[] = [];
  const unitPrice: number[] = [];
  const total: number[] = [];
  const labels = {
    liters: [] as number[],
    unitPrice: [] as number[],
    total: [] as number[],
  };

  around(LITER, lower, liters, labels.liters);
  around(PRICE, lower, unitPrice, labels.unitPrice);
  around(TOTAL, lower, total, labels.total);

  // Fallback: gather plausible numeric tokens.
  const all: number[] = [];
  let m: RegExpExecArray | null;
  const numRe = new RegExp(NUM, 'g');
  while ((m = numRe.exec(text)) !== null) {
    const n = toNum(m[1]!);
    if (n != null && n > 0 && n < 100_000) {
      all.push(n);
    }
  }

  for (const n of all) {
    if (n >= 1 && n <= 120 && !liters.includes(n)) {
      liters.push(n);
    }
    if (n >= 0.1 && n <= 200 && !unitPrice.includes(n)) {
      unitPrice.push(n);
    }
    if (n >= 1 && n <= 50_000 && !total.includes(n)) {
      total.push(n);
    }
  }

  return {
    liters: uniqSorted(liters).slice(-8),
    unitPrice: uniqSorted(unitPrice).slice(-8),
    total: uniqSorted(total).slice(-8),
    raw: text,
    labels: {
      liters: uniqSorted(labels.liters),
      unitPrice: uniqSorted(labels.unitPrice),
      total: uniqSorted(labels.total),
    },
  };
}

/** liters × unitPrice ≈ total within ~2%. */
export function receiptMathOk(pick: ReceiptPick, tol = 0.02): boolean | null {
  const { liters, unitPrice, total } = pick;
  if (liters == null || unitPrice == null || total == null) {
    return null;
  }
  if (!(liters > 0) || !(unitPrice > 0) || !(total > 0)) {
    return false;
  }
  const expected = liters * unitPrice;
  return Math.abs(expected - total) / total <= tol;
}

/** N × 1 = N. The camera clock and the "1." sticker multiply this way. */
function trivialIdentity(liters: number, unitPrice: number, total: number): boolean {
  const near1 = (n: number) => Math.abs(n - 1) <= 1e-9;
  return (near1(unitPrice) && liters === total) || (near1(liters) && unitPrice === total);
}

export function bestReceiptPick(c: ReceiptCandidates): ReceiptPick {
  const liters = uniqSorted([...c.liters, ...c.labels.liters]);
  const unitPrice = uniqSorted([...c.unitPrice, ...c.labels.unitPrice]);
  const total = uniqSorted([...c.total, ...c.labels.total]);
  const found: Array<Required<ReceiptPick> & { score: number }> = [];

  for (const l of liters) {
    for (const p of unitPrice) {
      for (const t of total) {
        if (!receiptMathOk({ liters: l, unitPrice: p, total: t })) {
          continue;
        }
        let score = 0;
        if (c.labels.liters.includes(l)) score += 4;
        if (c.labels.unitPrice.includes(p)) score += 4;
        if (c.labels.total.includes(t)) score += 4;
        if (l !== p && p !== t && l !== t) score += 1;
        if (trivialIdentity(l, p, t)) score -= 10;
        found.push({ liters: l, unitPrice: p, total: t, score });
      }
    }
  }

  // ponytail: unlabeled ties keep the larger number as liters (a normal fill).
  // A top-up where the unit price exceeds the liters can swap until LITER/PRICE/SALE sit next to the digits.
  found.sort((a, b) => b.score - a.score || b.liters - a.liters);
  const best = found[0];
  if (best) {
    return { liters: best.liters, unitPrice: best.unitPrice, total: best.total };
  }

  const pick: ReceiptPick = {};
  const l = c.labels.liters.at(-1) ?? c.liters.at(-1);
  const p = c.labels.unitPrice.at(-1) ?? c.unitPrice.at(-1);
  const t = c.labels.total.at(-1) ?? c.total.at(-1);
  if (l != null) pick.liters = l;
  if (p != null) pick.unitPrice = p;
  if (t != null) pick.total = t;
  return pick;
}
