import type { NearbyPoi } from '../data/remote';
import { connectorSpeed } from './connector-speed';

export type AroundFilter = 'best' | 'open' | 'more';

export { connectorSpeed };

const BEST_LIMIT = 12;

/** Client-side kind + chip filters for the Around list. */
export function filterAroundPois(
  pois: readonly NearbyPoi[],
  kind: 'fuel' | 'charge',
  filter: AroundFilter,
): NearbyPoi[] {
  let list = pois.filter((p) => p.kind === kind);
  if (filter === 'open') {
    list = list.filter((p) => p.openNow === true);
  }
  list = [...list].sort((a, b) => a.distanceKm - b.distanceKm);
  if (filter === 'more') {
    return list;
  }
  return list.slice(0, BEST_LIMIT);
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
