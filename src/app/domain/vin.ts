/** ISO 3779 VIN check digit (position 9). */
const TRANS: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
}

export function isValidVin(raw: string): boolean {
  const vin = normalizeVin(raw);
  if (vin.length !== 17) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]!;
    const n = /\d/.test(ch) ? Number(ch) : TRANS[ch];
    if (n == null) {
      return false;
    }
    sum += n * WEIGHTS[i]!;
  }
  const rem = sum % 11;
  const check = rem === 10 ? 'X' : String(rem);
  return vin[8] === check;
}
