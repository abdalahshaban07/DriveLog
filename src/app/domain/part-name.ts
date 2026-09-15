/** Normalize part names for duplicate detection (decision 84A). */
export function normalizePartName(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\s\-_./\\()'"]/g, '')
    .replace(/\u0640/g, ''); // Arabic tatweel
}

export function partNamesMatch(a: string, b: string): boolean {
  return normalizePartName(a) === normalizePartName(b);
}
