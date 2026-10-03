import { describe, expect, it } from 'vitest';
import { budgetPicture } from './budget-picture';

const tiers = { minimum: 3800, recommended: 7500, comfortable: 10000 };

describe('budgetPicture', () => {
  it('leads with the recommended reserve when no monthly budget is set', () => {
    const picture = budgetPicture({
      monthlyBudget: null,
      spent: 0,
      remaining: null,
      reserve: null,
      eligible90: 3800,
      tiers,
      forecasts: [],
    });
    expect(picture.figure).toBe('recommended');
    expect(picture.figureAmount).toBe(7500);
    expect(picture.coverage).toBeNull();
    expect(picture.gap).toBeNull();
    expect(picture.fill).toBe('none');
    expect(picture.marks.map((m) => m.pct)).toEqual([38, 75, 100]);
    expect(picture.marks.every((m) => !m.met)).toBe(true);
  });

  it('clamps an overspent month and scores coverage against the reserve', () => {
    const picture = budgetPicture({
      monthlyBudget: 2000,
      spent: 2500,
      remaining: 0,
      reserve: 8000,
      eligible90: 4000,
      tiers,
      forecasts: [
        { months: 3, known: 100, estimated: 50, unknownCount: 1 },
        { months: 6, known: 0, estimated: 0, unknownCount: 0 },
        {
          months: 12,
          known: 200,
          estimated: 0,
          unknownCount: 0,
          noteKey: 'budget.forecast.notEnoughMileage',
        },
      ],
    });
    expect(picture.figure).toBe('remaining');
    expect(picture.over).toBe(true);
    expect(picture.overAmount).toBe(500);
    expect(picture.spentPct).toBe(100);
    expect(picture.coverage).toBe(200);
    expect(picture.gap).toBe(-500);
    expect(picture.fill).toBe('met');
    expect(picture.marks.filter((m) => m.met).map((m) => m.key)).toEqual([
      'minimum',
      'recommended',
    ]);
    expect(picture.bars.map((b) => b.widthPct)).toEqual([75, 0, 100]);
    expect(picture.hasForecast).toBe(true);
    expect(picture.mileageNote).toBe(true);
  });

  it('stays empty when nothing has been priced yet', () => {
    const picture = budgetPicture({
      monthlyBudget: null,
      spent: 0,
      remaining: null,
      reserve: null,
      eligible90: 0,
      tiers: { minimum: null, recommended: null, comfortable: null },
      forecasts: [
        { months: 3, known: 0, estimated: 0, unknownCount: 0 },
        { months: 6, known: 0, estimated: 0, unknownCount: 0 },
        { months: 12, known: 0, estimated: 0, unknownCount: 0 },
      ],
    });
    expect(picture.figure).toBe('empty');
    expect(picture.marks).toEqual([]);
    expect(picture.hasForecast).toBe(false);
  });
});
