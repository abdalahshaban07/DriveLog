/** Read a dashboard-cluster photo's OCR text into whole-km odometer candidates. */

import { stripNoise, westernDigits } from './receipt-ocr';

export type OdometerCandidates = {
  /** Plausible readings, ascending. Trip meters, range, dates, and prices are dropped. */
  values: number[];
  /** Subset sitting next to an odometer word (ODO / km / عداد). */
  labeled: number[];
  raw: string;
};

const TRIP_BEFORE = /(?:trip|رحل[هة])\s*[a-z]?\s*[:=]?\s*$/i;
/** A label only counts when it directly touches the number, not a neighbor line. */
const LABEL_BEFORE = /(?:odo|odometer|mileage|total|km|كم|كيلومتر|عداد|مساف[هة])\s*[:=]?\s*$/i;
const LABEL_AFTER = /^\s*(?:km|كم|كيلومتر)(?!\w)/i;
/** Whole numeric runs; a run carrying a dot or comma is a decimal, not an odometer. */
const RUN = /\d+(?:[.,]\d+)*/g;

/** ISO and numeric calendar dates leave a 4-digit year that is not an odometer. */
function stripDates(text: string): string {
  return text
    .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, ' ');
}

/** Some clusters print comma thousands; mechanical ones print leading zeros. */
function normalizeGroups(text: string): string {
  return text.replace(/,(?=\d{3}(?!\d))/g, '');
}

export function parseOdometerText(raw: string): OdometerCandidates {
  const text = normalizeGroups(stripDates(stripNoise(westernDigits(raw))))
    .replace(/\s+/g, ' ')
    .trim();
  const values: number[] = [];
  const labeled: number[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(RUN.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const token = m[0];
    if (/[.,]/.test(token) || token.length < 4 || token.length > 7) {
      continue;
    }
    const n = Number(token);
    if (!Number.isFinite(n) || n < 1000 || n > 9_999_999) {
      continue;
    }
    const start = m.index;
    const end = start + token.length;
    const before = text.slice(Math.max(0, start - 14), start);
    if (TRIP_BEFORE.test(before)) {
      continue;
    }
    values.push(n);
    const after = text.slice(end, end + 8);
    if (LABEL_BEFORE.test(before) || LABEL_AFTER.test(after)) {
      labeled.push(n);
    }
  }
  const uniq = (ns: number[]) => [...new Set(ns)].sort((a, b) => a - b);
  return { values: uniq(values), labeled: uniq(labeled), raw: text };
}

/** The odometer dominates the cluster: prefer a labeled reading, else the largest. */
export function bestOdometerPick(c: OdometerCandidates): number | null {
  const pool = c.labeled.length ? c.labeled : c.values;
  return pool.length ? Math.max(...pool) : null;
}