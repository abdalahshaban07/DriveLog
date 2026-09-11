import { describe, expect, it } from 'vitest';
import type { NearbyPoi } from '../data/remote';
import {
  clampAroundRadiusKm,
  connectorSpeed,
  filterAroundPois,
  formatNearbyDistance,
} from './around-filter';

function poi(partial: Partial<NearbyPoi> & Pick<NearbyPoi, 'id' | 'kind'>): NearbyPoi {
  return {
    name: `P${partial.id}`,
    lat: 30,
    lon: 31,
    distanceKm: partial.distanceKm ?? 1,
    ...partial,
  };
}

describe('filterAroundPois', () => {
  const items: NearbyPoi[] = [
    poi({ id: 1, kind: 'fuel', distanceKm: 2, openNow: true }),
    poi({ id: 2, kind: 'fuel', distanceKm: 0.5, openNow: false }),
    poi({ id: 3, kind: 'fuel', distanceKm: 1, openNow: null }),
    poi({ id: 4, kind: 'charge', distanceKm: 0.2, openNow: true }),
  ];

  it('filters by kind and sorts by distance', () => {
    const list = filterAroundPois(items, 'fuel');
    expect(list.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('returns the full sorted list for the kind', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      poi({ id: i + 1, kind: 'fuel', distanceKm: 15 - i }),
    );
    expect(filterAroundPois(many, 'fuel')).toHaveLength(15);
    expect(filterAroundPois(many, 'fuel')[0]?.id).toBe(15);
  });

  it('keeps only charge points for charge kind', () => {
    expect(filterAroundPois(items, 'charge').map((p) => p.id)).toEqual([4]);
  });
});

describe('formatNearbyDistance', () => {
  const fmt = (n: number) => String(n);
  const labels = { m: 'm', km: 'km' };

  it('uses meters under 1 km', () => {
    expect(formatNearbyDistance(0.53, fmt, labels)).toBe('530 m');
  });

  it('uses one decimal km at 1+', () => {
    const fmt1 = (n: number, opts?: Intl.NumberFormatOptions) =>
      opts?.maximumFractionDigits === 1 ? n.toFixed(1) : String(n);
    expect(formatNearbyDistance(1.14, fmt1, labels)).toBe('1.1 km');
  });
});

describe('clampAroundRadiusKm', () => {
  it('defaults, clamps, and rounds', () => {
    expect(clampAroundRadiusKm(Number.NaN)).toBe(15);
    expect(clampAroundRadiusKm(0)).toBe(1);
    expect(clampAroundRadiusKm(80)).toBe(50);
    expect(clampAroundRadiusKm(12.4)).toBe(12);
  });
});

describe('connectorSpeed', () => {
  it('buckets by kW', () => {
    expect(connectorSpeed(150)).toBe('fast');
    expect(connectorSpeed(22)).toBe('medium');
    expect(connectorSpeed(7)).toBe('slow');
    expect(connectorSpeed(undefined)).toBe('medium');
  });
});
