import { describe, expect, it } from 'vitest';
import {
  buildSetupChecklist,
  isRealFillUp,
  shouldShowSetupChecklist,
} from './setup-checklist';
import type { Car, FillUp, Maintenance } from './models';

const car = { id: 'c1' } as Car;

function fill(id: string): FillUp {
  return { id } as FillUp;
}

describe('buildSetupChecklist', () => {
  it('marks all incomplete when empty', () => {
    expect(buildSetupChecklist({ car: null, fills: [], maintenance: [] })).toEqual([
      { id: 'car', done: false },
      { id: 'fill', done: false },
      { id: 'due', done: false },
    ]);
  });

  it('requires a real (non-sample) fill-up', () => {
    const items = buildSetupChecklist({
      car,
      fills: [fill('sample-1'), fill('real-1')],
      maintenance: [{ id: 'm1', dueKm: 10000 } as Maintenance],
    });
    expect(items).toEqual([
      { id: 'car', done: true },
      { id: 'fill', done: true },
      { id: 'due', done: true },
    ]);
  });

  it('ignores sample-only fills', () => {
    const items = buildSetupChecklist({
      car,
      fills: [fill('sample-a')],
      maintenance: [],
    });
    expect(items.find((i) => i.id === 'fill')?.done).toBe(false);
  });
});

describe('shouldShowSetupChecklist', () => {
  const incomplete = buildSetupChecklist({ car: null, fills: [], maintenance: [] });

  it('hides in sample mode or when dismissed', () => {
    expect(
      shouldShowSetupChecklist({
        sampleMode: true,
        checklistDismissed: false,
        items: incomplete,
      }),
    ).toBe(false);
    expect(
      shouldShowSetupChecklist({
        sampleMode: false,
        checklistDismissed: true,
        items: incomplete,
      }),
    ).toBe(false);
  });

  it('hides when every item is done', () => {
    const done = buildSetupChecklist({
      car,
      fills: [fill('r1')],
      maintenance: [{ id: 'm', dueDate: '2026-10-01' } as Maintenance],
    });
    expect(
      shouldShowSetupChecklist({
        sampleMode: false,
        checklistDismissed: false,
        items: done,
      }),
    ).toBe(false);
  });
});

describe('isRealFillUp', () => {
  it('rejects sample-prefixed ids', () => {
    expect(isRealFillUp(fill('sample-x'))).toBe(false);
    expect(isRealFillUp(fill('abc'))).toBe(true);
  });
});
