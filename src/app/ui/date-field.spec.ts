import { describe, expect, it } from 'vitest';
import {
  monthCells,
  toDateOnly,
  weekStartDay,
  weekdayLabels,
} from './date-field';

describe('date-field calendar', () => {
  it('writes local YYYY-MM-DD without UTC', () => {
    expect(toDateOnly(2027, 3, 15)).toBe('2027-04-15');
  });

  it('starts the week on Sunday in en and Saturday in ar', () => {
    expect(weekStartDay('en-US', 'en')).toBe(0);
    expect(weekStartDay('ar-EG', 'ar')).toBe(6);
  });

  it('pads April 2027 from Sunday with Thursday the 1st', () => {
    const cells = monthCells(2027, 3, 0);
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, 1]);
    expect(cells.filter((d) => d !== null)).toHaveLength(30);
  });

  it('relabels weekdays from Intl', () => {
    expect(weekdayLabels('en', 0)[0]).toMatch(/Su/i);
    expect(weekdayLabels('ar-EG', 6)).toHaveLength(7);
  });
});
