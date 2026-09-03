import { describe, expect, it } from 'vitest';
import { buildSampleDataset, SAMPLE_CAR_ID } from './sample-data';
import { latestEconomy } from './economy';

describe('buildSampleDataset', () => {
  it('prefixes all ids with sample-', () => {
    const { car, fillUps, maintenance } = buildSampleDataset(new Date('2026-09-01'));
    expect(car.id).toBe(SAMPLE_CAR_ID);
    expect(fillUps.every((f) => f.id.startsWith('sample-'))).toBe(true);
    expect(maintenance.every((m) => m.id.startsWith('sample-'))).toBe(true);
  });

  it('produces realistic economy between 5 and 15 L/100km', () => {
    const { fillUps } = buildSampleDataset(new Date('2026-09-01'));
    const eco = latestEconomy(fillUps);
    expect(eco?.litersPer100Km).toBeGreaterThan(5);
    expect(eco?.litersPer100Km).toBeLessThan(15);
  });
});
