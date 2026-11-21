import { describe, expect, it } from 'vitest';
import { maintenanceChanged, normalizeMaintenanceRevision } from './maintenance-revision';
import type { Maintenance } from './models';
const row: Maintenance = {
  id: 'm1',
  carId: 'c1',
  type: 'oil',
  date: '2026-11-21',
  odometer: 100,
  cost: 100,
  createdAt: 'a',
  updatedAt: 'a',
};
describe('maintenance revisions', () => {
  it('ignores timestamp-only/no-op saves but detects changed values and cleared model', () => {
    expect(maintenanceChanged(row, { ...row, updatedAt: 'b' })).toBe(false);
    expect(maintenanceChanged(row, { ...row, cost: 101 })).toBe(true);
    expect(
      maintenanceChanged({ ...row, partModel: '5W30' }, { ...row, partModel: undefined }),
    ).toBe(true);
  });
  it('rejects a revision for a different record or car and clones accepted snapshots', () => {
    const revision = {
      id: 'r1',
      maintenanceId: 'm1',
      carId: 'c1',
      savedAt: '2026-11-21T10:00:00Z',
      snapshot: row,
    };
    expect(() => normalizeMaintenanceRevision({ ...revision, maintenanceId: 'other' })).toThrow();
    expect(() => normalizeMaintenanceRevision({ ...revision, carId: 'other' })).toThrow();
    const result = normalizeMaintenanceRevision(revision);
    result.snapshot.cost = 200;
    expect(row.cost).toBe(100);
  });
});
