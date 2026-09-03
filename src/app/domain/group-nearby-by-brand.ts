import type { NearbyPoi } from '../data/remote';

export interface NearbyGroup {
  /** Lowercase brand key; 'other' = unlabeled stations. */
  brand: string;
  /** Original-casing brand name; undefined for the 'other' bucket. */
  displayName?: string;
  pois: NearbyPoi[];
}

/** Group and sort POIs by brand (branded first by nearest, unlabeled last). */
export function groupNearbyByBrand(pois: readonly NearbyPoi[]): NearbyGroup[] {
  const map = new Map<string, NearbyPoi[]>();
  for (const poi of pois) {
    const key = poi.brand?.trim().toLowerCase() || 'other';
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(poi);
  }
  const groups: NearbyGroup[] = [];
  for (const [brand, items] of map) {
    groups.push({
      brand,
      displayName: brand === 'other' ? undefined : (items[0]?.brand ?? brand),
      pois: items,
    });
  }
  return groups.sort((a, b) => {
    if (a.brand === 'other' && b.brand !== 'other') return 1;
    if (a.brand !== 'other' && b.brand === 'other') return -1;
    return (a.pois[0]?.distanceKm ?? 0) - (b.pois[0]?.distanceKm ?? 0);
  });
}
