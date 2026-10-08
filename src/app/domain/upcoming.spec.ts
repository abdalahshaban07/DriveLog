import { describe, expect, it } from 'vitest';
import type { Maintenance, VehicleDocument } from './models';
import { buildUpcoming } from './upcoming';

const today = '2026-10-08';

function maint(partial: Partial<Maintenance> & Pick<Maintenance, 'id'>): Maintenance {
  return {
    type: 'oil',
    odometer: 1000,
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function doc(partial: Partial<VehicleDocument> & Pick<VehicleDocument, 'id' | 'kind' | 'expiryDate'>): VehicleDocument {
  return {
    carId: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildUpcoming', () => {
  it('keeps overdue and the next 90 days, and drops the rest', () => {
    const items = buildUpcoming({
      today,
      odometer: 1000,
      documents: [
        doc({ id: 'ins', kind: 'insurance', expiryDate: '2026-10-20' }),
        doc({ id: 'far', kind: 'inspection', expiryDate: '2027-05-01' }),
      ],
      maintenance: [
        maint({ id: 'late', dueDate: '2026-09-01' }),
        maint({ id: 'soon', dueDate: '2026-11-01' }),
        maint({ id: 'far', dueDate: '2027-02-01' }),
        maint({ id: 'km-soon', dueKm: 1400, type: 'filter' }),
        maint({ id: 'km-far', dueKm: 2000, type: 'tires' }),
        maint({ id: 'km-over', dueKm: 900, type: 'brakes' }),
      ],
    });

    expect(items.map((item) => item.id)).toEqual([
      'maint-late',
      'maint-km-over',
      'doc-ins',
      'maint-km-soon',
      'maint-soon',
    ]);
    expect(items.find((item) => item.id === 'maint-km-soon')?.kmOnly).toBe(true);
    expect(items.find((item) => item.id === 'maint-soon')?.status).toBe('future');
    expect(items.find((item) => item.id === 'doc-ins')?.route).toBe('/vault');
    expect(items.find((item) => item.id === 'maint-late')?.route).toBe('/maintenance');
  });

  it('uses the vault date for license and falls back to the car', () => {
    const fromVault = buildUpcoming({
      today,
      odometer: 0,
      licenseExpiry: '2026-10-01',
      documents: [doc({ id: 'lic', kind: 'license', expiryDate: '2026-12-01' })],
      maintenance: [],
    });
    expect(fromVault.map((item) => item.id)).toEqual(['doc-lic']);

    const fromCar = buildUpcoming({
      today,
      odometer: 0,
      licenseExpiry: '2026-10-20',
      documents: [],
      maintenance: [],
    });
    expect(fromCar.map((item) => item.id)).toEqual(['car-license']);
  });
});
