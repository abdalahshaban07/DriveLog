/** Parse fuel receipt OCR text into candidate fields (EN-first heuristics). */

export type ReceiptCandidates = {
  liters: number[];
  unitPrice: number[];
  total: number[];
  raw: string;
};

export type ReceiptPick = {
  liters?: number;
  unitPrice?: number;
  total?: number;
};

const NUM = /(\d{1,4}(?:[.,]\d{1,3})?)/g;

/** Arabic-Indic and Persian digits → ASCII so labeled regexes can see them. */
function westernDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
}

function toNum(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function uniqSorted(nums: number[]): number[] {
  return [...new Set(nums.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
}

/** Extract candidate liters / unit price / totals from OCR text. */
export function parseReceiptText(raw: string): ReceiptCandidates {
  const text = westernDigits(raw).replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const liters: number[] = [];
  const unitPrice: number[] = [];
  const total: number[] = [];

  const labeled = (re: RegExp, sink: number[]) => {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    while ((m = r.exec(lower)) !== null) {
      const n = toNum(m[1] ?? '');
      if (n != null && n > 0) {
        sink.push(n);
      }
    }
  };

  labeled(/(?:liters?|ltr|ltrs|volume|كمية|لتر)\s*[:=]?\s*(\d{1,4}(?:[.,]\d{1,3})?)/gi, liters);
  labeled(/(?:price|unit|per\s*l|\/\s*l|سعر)\s*[:=]?\s*(\d{1,4}(?:[.,]\d{1,3})?)/gi, unitPrice);
  labeled(/(?:total|amount|sum|الإجمالي|المجموع)\s*[:=]?\s*(\d{1,5}(?:[.,]\d{1,3})?)/gi, total);

  // Fallback: gather plausible numeric tokens.
  const all: number[] = [];
  let m: RegExpExecArray | null;
  NUM.lastIndex = 0;
  while ((m = NUM.exec(text)) !== null) {
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

export function bestReceiptPick(c: ReceiptCandidates): ReceiptPick {
  const pick: ReceiptPick = {};
  // Prefer combo that satisfies math.
  for (const liters of c.liters.slice().reverse()) {
    for (const unitPrice of c.unitPrice.slice().reverse()) {
      for (const total of c.total.slice().reverse()) {
        if (receiptMathOk({ liters, unitPrice, total })) {
          return { liters, unitPrice, total };
        }
      }
    }
  }
  if (c.liters.length) {
    pick.liters = c.liters[c.liters.length - 1];
  }
  if (c.unitPrice.length) {
    pick.unitPrice = c.unitPrice[c.unitPrice.length - 1];
  }
  if (c.total.length) {
    pick.total = c.total[c.total.length - 1];
  }
  return pick;
}
