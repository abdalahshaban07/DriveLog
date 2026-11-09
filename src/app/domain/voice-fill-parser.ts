/** Parse a spoken fill-up ("40 liters, 500 km, petrol 95") into form fields. */

import { normalizeAdvisorText } from './advisor-intent';
import type { FuelGrade } from './models';
import { westernDigits } from './receipt-ocr';

export type VoiceFill = {
  liters?: number;
  distanceKm?: number;
  fuelGrade?: FuelGrade;
};

const LITER = String.raw`liters?|litres?|ltrs?|لترات|لتر`;
const DIST = String.raw`kilometers?|kilometres?|km|كيلومتر|كيلو|كم`;

/** A number touching the unit word, on either side ("40 liters" / "لتر 40"). */
function adjacentNumber(unit: string, text: string): number | null {
  const num = String.raw`(\d+(?:[.,]\d+)?)`;
  const before = text.match(new RegExp(`${num}\\s*(?:${unit})`, 'i'));
  const after = text.match(new RegExp(`(?:${unit})\\s*${num}`, 'i'));
  const raw = before?.[1] ?? after?.[1];
  if (!raw) {
    return null;
  }
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function detectGrade(text: string): FuelGrade | undefined {
  if (/diesel|سولار|جاز/.test(text)) {
    return 'diesel';
  }
  const fuel = String.raw`(?:بنزين|petrol|gasoline|\bgas\b)`;
  if (new RegExp(`${fuel}\\s*(?:رقم\\s*)?95|95\\s*(?:octane|بنزين)`).test(text)) {
    return 'gasoline95';
  }
  if (new RegExp(`${fuel}\\s*(?:رقم\\s*)?92|92\\s*(?:octane|بنزين)`).test(text)) {
    return 'gasoline92';
  }
  return undefined;
}

export function parseVoiceFill(raw: string): VoiceFill {
  const text = normalizeAdvisorText(westernDigits(raw));
  const out: VoiceFill = {};
  const liters = adjacentNumber(LITER, text);
  if (liters != null && liters > 0 && liters <= 300) {
    out.liters = liters;
  }
  const distance = adjacentNumber(DIST, text);
  if (distance != null && distance > 0 && distance <= 100_000) {
    out.distanceKm = distance;
  }
  const grade = detectGrade(text);
  if (grade) {
    out.fuelGrade = grade;
  }
  return out;
}

export function hasVoiceFill(v: VoiceFill): boolean {
  return v.liters != null || v.distanceKm != null || v.fuelGrade != null;
}