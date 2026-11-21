import { describe, expect, it } from 'vitest';
import { activeMaintenanceDueRecords } from './maintenance-lifecycle';
import { lastResetRecord } from './history-analyzer';
import { buildUpcoming } from './upcoming';
import { buildDueItems } from './dues';
import { normalizeSettings } from '../data/db-normalize';
import type { Maintenance } from './models';

const row = (id: string, extra: Partial<Maintenance> = {}): Maintenance => ({
  id,
  carId: 'car-a',
  type: 'oil',
  partDefinitionId: 'sys-engine-oil',
  recordType: 'service',
  date: '2026-10-01',
  odometer: 10000,
  dueKm: 15000,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...extra,
});
const ids = (rows: Maintenance[]) => activeMaintenanceDueRecords(rows).map((r) => r.id);

describe('maintenance due lifecycle', () => {
  it('new replacement retires the old due without changing history or amounts', () => {
    const rows = [
      row('old'),
      row('new', { recordType: 'replacement', date: '2026-11-01', odometer: 16000, dueKm: 21000 }),
    ];
    const before = structuredClone(rows);
    expect(ids(rows)).toEqual(['new']);
    expect(rows).toEqual(before);
    const upcoming = buildUpcoming({
      maintenance: rows,
      documents: [],
      odometer: 16000,
      today: '2026-11-21',
    });
    expect(upcoming).toHaveLength(0); // next service is beyond the km-only horizon
    const dues = buildDueItems(normalizeSettings({}), rows, 16000, '2026-11-21');
    expect(dues.map((d) => d.maintenanceId)).toEqual(['new']);
    expect(dues[0].status).toBe('future');
  });
  it('a service without a new due still clears the retired reminder', () => {
    expect(ids([row('old'), row('new', { date: '2026-11-01', dueKm: undefined })])).toEqual([
      'new',
    ]);
  });
  it('an inspection or measurement does not reset the service; newer follow-ups remain', () => {
    for (const recordType of ['inspection', 'measurement', 'repair'] as const) {
      const inspection = row('check', { date: '2026-11-01', recordType, dueKm: 17000 });
      expect(ids([row('old'), inspection])).toEqual(['old', 'check']);
      expect(ids([row('old'), inspection, row('replacement', { date: '2026-11-02' })])).toEqual([
        'replacement',
      ]);
    }
  });
  it('keeps cars and distinct custom parts separate even with the same legacy type', () => {
    expect(
      ids([
        row('a'),
        row('b', { carId: 'car-b' }),
        row('custom', { type: 'other', partDefinitionId: 'custom-a' }),
        row('custom-b', { type: 'other', partDefinitionId: 'custom-b' }),
      ]),
    ).toEqual(['a', 'b', 'custom', 'custom-b']);
  });
  it('uses service date, then odometer, creation and id, never updatedAt or input order', () => {
    const old = row('old', { updatedAt: '2026-12-01T00:00:00Z' });
    const newer = row('new', { date: '2026-11-01' });
    expect(ids([newer, old])).toEqual(['new']);
    expect(ids([row('a'), row('b', { odometer: 10001 })])).toEqual(['b']);
    expect(ids([row('a'), row('b', { createdAt: '2026-10-01T11:00:00Z' })])).toEqual(['b']);
    expect(ids([row('b'), row('a')])).toEqual(['b']);
    expect(lastResetRecord([old, newer], 'sys-engine-oil')?.id).toBe('new');
  });
  it('deleting the newest reveals the previous due, backdating does not supersede it', () => {
    const latest = row('latest', { date: '2026-11-01' });
    const backdated = row('backdated', { date: '2026-09-01', createdAt: '2026-12-01T00:00:00Z' });
    expect(ids([row('old'), latest, backdated])).toEqual(['latest']);
    expect(ids([row('old'), backdated])).toEqual(['old']);
  });
  it('handles legacy oil records with no part id or record type', () => {
    expect(
      ids([
        row('legacy', { partDefinitionId: undefined, recordType: undefined }),
        row('current', { date: '2026-11-01' }),
      ]),
    ).toEqual(['current']);
  });
  it('does not suppress unrelated legacy custom labels', () => {
    expect(
      ids([
        row('a', { partDefinitionId: undefined, type: 'other', otherLabel: 'Belt' }),
        row('b', { partDefinitionId: undefined, type: 'other', otherLabel: 'Gearbox' }),
      ]),
    ).toEqual(['a', 'b']);
  });
});
