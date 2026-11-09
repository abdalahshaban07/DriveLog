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
function adjacentNumber(unit: string, text: string, badBefore: RegExp): number | null {
  const num = String.raw`(\d+(?:[.,]\d+)?)`;
  const patterns = [
    new RegExp(`${num}\\s*(?:${unit})`, 'gi'),
    new RegExp(`(?:${unit})\\s*${num}`, 'gi'),
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // "price per liter 13.5" / "odometer 45000 km" name a different field.
      if (badBefore.test(text.slice(Math.max(0, m.index - 16), m.index))) {
        continue;
      }
      const grouped = m[1].replace(/,(?=\d{3}(?!\d))/g, '');
      const n = Number(grouped.replace(',', '.'));
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return null;
}

function detectGrade(text: string): FuelGrade | undefined {
  // Solar is the app's selectable diesel-grade; legacy 'diesel' has no picker chip.
  if (/diesel|سولار|جاز/.test(text)) {
    return 'solar';
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
  const liters = adjacentNumber(
    LITER,
    text,
    /(?:price|per|cost|سعر|ثمن)\s*(?:ال)?$/i,
  );
  if (liters != null && liters > 0 && liters <= 300) {
    out.liters = liters;
  }
  const distance = adjacentNumber(
    DIST,
    text,
    /(?:odometer|odo|mileage|عداد)\s*[:=]?\s*$/i,
  );
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