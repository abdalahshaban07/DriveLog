import { describe, expect, it } from 'vitest';
import { FUEL_TIP_KEYS, nextFuelTipKey } from './local-coach';
import type { Db } from '../data/db';

function mockDb(): Db {
  const fills = [
    {
      id: 'f1',
      odometer: 1000,
      liters: 40,
      cost: 50,
      tankFull: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      date: '2026-01-01',
    },
    {
      id: 'f2',
      odometer: 1100,
      liters: 40,
      cost: 50,
      tankFull: true,
      createdAt: '2026-02-01T00:00:00.000Z',
      date: '2026-02-01',
    },
  ];
  return {
    car: () => ({ currentOdometer: 12000, id: 'c1', initialOdometer: 0, name: 'Test' }),
    fillUps: () => fills as ReturnType<Db['fillUps']>,
  } as unknown as Db;
}

describe('nextFuelTipKey', () => {
  it('returns a different key on consecutive calls', () => {
    const db = mockDb();
    const first = FUEL_TIP_KEYS[0]!;
    const second = nextFuelTipKey(first, db);
    expect(second).not.toBe(first);
    const third = nextFuelTipKey(second, db);
    expect(third).not.toBe(second);
  });
});
