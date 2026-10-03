import { describe, expect, it } from 'vitest';
import { operatingSnapshot } from './operating-snapshot';

describe('operatingSnapshot', () => {
  it('counts days, km, and tank range from the last fill', () => {
    const snap = operatingSnapshot({
      today: '2026-06-10',
      fillDate: '2026-06-01',
      fillOdometer: 1000,
      currentOdometer: 1280,
      place: '  Shell  ',
      tankLiters: 50,
      litersPer100: 8,
    });
    expect(snap.daysSinceFill).toBe(9);
    expect(snap.kmSinceFill).toBe(280);
    expect(snap.rangeKm).toBe(625);
    expect(snap.place).toBe('Shell');
  });

  it('omits km and range when the readings do not support them', () => {
    const snap = operatingSnapshot({
      today: '2026-06-10',
      fillDate: '2026-06-10',
      fillOdometer: 1500,
      currentOdometer: 1400,
      litersPer100: null,
    });
    expect(snap.daysSinceFill).toBe(0);
    expect(snap.kmSinceFill).toBeNull();
    expect(snap.rangeKm).toBeNull();
    expect(snap.place).toBeNull();
  });
});
