import type { NearbyPoi } from '../data/remote';
import { connectorSpeed } from './connector-speed';

export { connectorSpeed };

export const AROUND_RADIUS_DEFAULT_KM = 15;
export const AROUND_RADIUS_MIN_KM = 1;
export const AROUND_RADIUS_MAX_KM = 50;

export function clampAroundRadiusKm(raw: number): number {
  if (!Number.isFinite(raw)) {
    return AROUND_RADIUS_DEFAULT_KM;
  }
  return Math.min(
    AROUND_RADIUS_MAX_KM,
    Math.max(AROUND_RADIUS_MIN_KM, Math.round(raw)),
  );
}

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
