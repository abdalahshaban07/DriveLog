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

  it('includes health part links and budget fields', () => {
    const { car, maintenance, partOverrides } = buildSampleDataset(new Date('2026-09-01'));
    expect(car.maintenanceBudgetMonthly).toBeGreaterThan(0);
    expect(maintenance.every((m) => !!m.partDefinitionId)).toBe(true);
    expect(partOverrides.length).toBeGreaterThan(0);
  });
});
