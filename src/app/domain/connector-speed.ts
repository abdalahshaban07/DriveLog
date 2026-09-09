/** Bucket EV power into display speed labels. */
export function connectorSpeed(
  powerKw: number | undefined,
): 'fast' | 'medium' | 'slow' {
  if (powerKw == null || !Number.isFinite(powerKw)) {
    return 'medium';
  }
  if (powerKw >= 50) {
    return 'fast';
  }
  if (powerKw >= 22) {
    return 'medium';
  }
  return 'slow';
}
