/** Round odometer km for display priming and persistence (no float artifacts). */
export function roundOdometerKm(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value);
}

/** Integer string for odometer inputs; empty when value is missing. */
export function odometerInputValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '';
  }
  return String(roundOdometerKm(value));
}
