import { describe, expect, it } from 'vitest';
import type { NearbyPoi } from '../data/remote';
import { groupNearbyByBrand } from './group-nearby-by-brand';

function poi(
  id: number,
  brand: string | undefined,
  distanceKm: number,
  kind: 'fuel' | 'charge' = 'fuel',
): NearbyPoi {
  return { id, kind, name: brand ?? 'Station', lat: 0, lon: 0, distanceKm, brand };
}

describe('groupNearbyByBrand', () => {
  it('returns empty array for empty input', () => {
    expect(groupNearbyByBrand([])).toEqual([]);
  });

  it('groups by brand and puts other last', () => {
    const groups = groupNearbyByBrand([
      poi(1, 'Shell', 0.5),
      poi(2, undefined, 0.6),
      poi(3, 'Shell', 1.0),
      poi(4, 'BP', 0.8),
    ]);
    expect(groups.map((g) => g.brand)).toEqual(['shell', 'bp', 'other']);
    expect(groups[0]?.pois).toHaveLength(2);
    expect(groups[2]?.brand).toBe('other');
    expect(groups[2]?.displayName).toBeUndefined();
  });

  it('preserves original casing in displayName', () => {
    const groups = groupNearbyByBrand([poi(1, 'TotalEnergies', 1.0)]);
    expect(groups[0]?.displayName).toBe('TotalEnergies');
    expect(groups[0]?.brand).toBe('totalenergies');
  });

  it('sorts branded groups by nearest poi', () => {
    const groups = groupNearbyByBrand([
      poi(1, 'Faraway', 5.0),
      poi(2, 'Close', 0.3),
    ]);
    expect(groups[0]?.brand).toBe('close');
    expect(groups[1]?.brand).toBe('faraway');
  });

  it('a brand with only one poi stays in its group', () => {
    const groups = groupNearbyByBrand([poi(1, 'Solo', 2.0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.pois).toHaveLength(1);
  });
});
