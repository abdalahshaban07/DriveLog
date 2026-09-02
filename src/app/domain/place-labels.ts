import type { FillUp } from './models';

/** Distinct non-empty place labels from fill-up history, sorted A→Z. */
export function distinctPlaceLabels(fillUps: readonly FillUp[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fillUps) {
    const label = f.placeLabel?.trim();
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
