import type { NearbyPoi } from '../data/remote';
import { connectorSpeed } from './connector-speed';

export { connectorSpeed };

/** Kind filter + distance sort for the Around list. */
export function filterAroundPois(
  pois: readonly NearbyPoi[],
  kind: 'fuel' | 'charge',
): NearbyPoi[] {
  return pois
    .filter((p) => p.kind === kind)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Format distance: meters under 1 km, else 1-decimal km. */
export function formatNearbyDistance(
  distanceKm: number,
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string,
  labels: { m: string; km: string },
): string {
  if (!(distanceKm >= 0) || !Number.isFinite(distanceKm)) {
    return '';
  }
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${formatNumber(meters)} ${labels.m}`;
  }
  return `${formatNumber(distanceKm, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${labels.km}`;
}
