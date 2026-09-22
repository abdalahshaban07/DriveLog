import { describe, expect, it } from 'vitest';
import {
  daysUntilExpiry,
  docUrgency,
  migrateCarExpiryToVault,
  nextExpiringDoc,
  sortDocsByUrgency,
} from './vehicle-docs';
import type { VehicleDocument } from './models';

function doc(partial: Partial<VehicleDocument> & Pick<VehicleDocument, 'id' | 'expiryDate'>): VehicleDocument {
  return {
    carId: 'car1',
    kind: 'insurance',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('vehicle-docs', () => {
  it('ranks urgency and sorts soonest first', () => {
    const today = '2026-03-20';
    expect(daysUntilExpiry('2026-03-10', today)).toBe(-10);
    expect(docUrgency('2026-03-10', today)).toBe('expired');
    expect(docUrgency('2026-03-21', today)).toBe('d1');
    expect(docUrgency('2026-03-25', today)).toBe('d7');
    expect(docUrgency('2026-04-10', today)).toBe('d30');
    expect(docUrgency('2026-06-01', today)).toBe('ok');

    const sorted = sortDocsByUrgency(
      [
        doc({ id: 'a', expiryDate: '2026-06-01' }),
        doc({ id: 'b', expiryDate: '2026-03-10' }),
        doc({ id: 'c', expiryDate: '2026-03-25' }),
      ],
      today,
    );
    expect(sorted.map((d) => d.id)).toEqual(['b', 'c', 'a']);
    expect(nextExpiringDoc(sorted, today)?.id).toBe('b');
  });

  it('migrates car license/registration into vault once', () => {
    const seeded = migrateCarExpiryToVault(
      { id: 'car1', licenseExpiry: '2026-06-15', registrationExpiry: '2026-05-01' },
      [],
      '2026-03-20T00:00:00.000Z',
    );
    expect(seeded).toHaveLength(2);
    expect(seeded.map((d) => d.kind).sort()).toEqual(['license', 'registration']);

    const again = migrateCarExpiryToVault(
      { id: 'car1', licenseExpiry: '2026-06-15', registrationExpiry: '2026-05-01' },
      seeded,
      '2026-03-20T00:00:00.000Z',
    );
    expect(again).toHaveLength(0);
  });
});
