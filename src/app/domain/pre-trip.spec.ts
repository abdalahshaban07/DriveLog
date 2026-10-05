import { describe, expect, it } from 'vitest';
import { allPreTripChecked, countPreTripChecked, emptyPreTripItems } from './pre-trip';

describe('pre-trip counts', () => {
  it('counts checks and treats a full set as ready', () => {
    const items = emptyPreTripItems();
    expect(countPreTripChecked(items)).toBe(0);
    expect(allPreTripChecked(items)).toBe(false);
    items.tires = true;
    items.lights = true;
    expect(countPreTripChecked(items)).toBe(2);
    for (const id of Object.keys(items) as (keyof typeof items)[]) {
      items[id] = true;
    }
    expect(countPreTripChecked(items)).toBe(6);
    expect(allPreTripChecked(items)).toBe(true);
  });
});
