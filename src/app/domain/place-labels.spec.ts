import { describe, expect, it } from 'vitest';
import { distinctPlaceLabels } from './place-labels';
import type { FillUp } from './models';

function fill(partial: Partial<FillUp> & Pick<FillUp, 'id'>): FillUp {
  return {
    odometer: 1000,
    liters: 40,
    cost: 50,
    tankFull: true,
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('distinctPlaceLabels', () => {
  it('returns unique trimmed labels sorted alphabetically', () => {
    expect(
      distinctPlaceLabels([
        fill({ id: 'a', placeLabel: ' Shell ' }),
        fill({ id: 'b', placeLabel: 'Mobil' }),
        fill({ id: 'c', placeLabel: 'Shell' }),
        fill({ id: 'd', placeLabel: '' }),
        fill({ id: 'e' }),
      ]),
    ).toEqual(['Mobil', 'Shell']);
  });

  it('returns empty array when no labels exist', () => {
    expect(distinctPlaceLabels([fill({ id: 'a' })])).toEqual([]);
  });
});
