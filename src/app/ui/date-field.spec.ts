import { describe, expect, it } from 'vitest';
import {
  monthCells,
  monthLabels,
  toDateOnly,
  weekStartDay,
  weekdayLabels,
  yearOptionsForMode,
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

  it('lists 12 localized month labels', () => {
    const months = monthLabels('en-US');
    expect(months).toHaveLength(12);
    expect(months[0].value).toBe(0);
    expect(months[0].label.length).toBeGreaterThan(2);
  });
});

describe('yearOptionsForMode', () => {
  const year = 2026;

  it('record mode spans 30 years back through current year', () => {
    expect(yearOptionsForMode('record', year)).toEqual([
      1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007,
      2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
      2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
  });

  it('due mode extends 20 years into the future', () => {
    const options = yearOptionsForMode('due', year);
    expect(options[0]).toBe(1996);
    expect(options.at(-1)).toBe(2046);
    expect(options).toHaveLength(51);
  });

  it('keeps an out-of-range selected year in the list', () => {
    expect(yearOptionsForMode('record', year, '2055-06-01')).toContain(2055);
    expect(yearOptionsForMode('record', year, '1960-01-15')).toContain(1960);
  });

  it('ignores invalid selected dates', () => {
    expect(yearOptionsForMode('record', year, 'not-a-date')).toEqual(
      yearOptionsForMode('record', year),
    );
  });
});
