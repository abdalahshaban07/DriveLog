import { describe, expect, it } from 'vitest';
import { bestOdometerPick, parseOdometerText } from './odometer-ocr';

describe('odometer-ocr', () => {
  it('reads a bare digital cluster reading', () => {
    const c = parseOdometerText('45000');
    expect(c.values).toEqual([45000]);
    expect(bestOdometerPick(c)).toBe(45000);
  });

  it('reads a labeled ODO line and prefers it over a smaller unlabeled number', () => {
    const c = parseOdometerText('ODO 45000\n1234');
    expect(c.labeled).toEqual([45000]);
    expect(bestOdometerPick(c)).toBe(45000);
  });

  it('reads km-labeled readings in English and Arabic', () => {
    expect(bestOdometerPick(parseOdometerText('45000 km'))).toBe(45000);
    expect(bestOdometerPick(parseOdometerText('عداد ٤٥٠٠٠ كم'))).toBe(45000);
    expect(bestOdometerPick(parseOdometerText('كيلومتر: ۴۵۰۰۰'))).toBe(45000);
  });

  it('normalizes leading zeros on mechanical clusters', () => {
    expect(bestOdometerPick(parseOdometerText('045000'))).toBe(45000);
    expect(bestOdometerPick(parseOdometerText('0012345'))).toBe(12345);
  });

  it('normalizes comma thousands', () => {
    expect(bestOdometerPick(parseOdometerText('ODO 45,000 km'))).toBe(45000);
  });

  it('drops decimal trip meters and keeps the whole odometer', () => {
    const c = parseOdometerText('TRIP 450.7\nODO 45000\n320.5');
    expect(c.values).toEqual([45000]);
    expect(bestOdometerPick(c)).toBe(45000);
  });

  it('drops an integer trip meter sitting next to a trip word', () => {
    const c = parseOdometerText('TRIP 1234\nODO 45000');
    expect(c.values).toEqual([45000]);
    expect(c.values).not.toContain(1234);
  });

  it('drops Arabic trip words', () => {
    const c = parseOdometerText('رحلة ١٢٣٤\nعداد ٤٥٠٠٠');
    expect(c.values).toEqual([45000]);
  });

  it('ignores range, temperature, and radio tokens under four digits', () => {
    const c = parseOdometerText('320 km\n22.5 C\n98.5 FM\n45000');
    expect(c.values).toEqual([45000]);
  });

  it('strips camera date stamps and times', () => {
    const c = parseOdometerText('2026-11-08\n08/11/2026\nNovember 8, 2026 at 1:47 AM\n45000');
    expect(c.values).toEqual([45000]);
  });

  it('ignores prices and totals from a receipt in the same photo', () => {
    const c = parseOdometerText('SALE 840.24\nLITER 35.010\nPRICE 24.00\n45000');
    expect(c.values).toEqual([45000]);
  });

  it('rejects phone-length and VIN-length digit runs', () => {
    const c = parseOdometerText('01001234567\n12345678\n45000');
    expect(c.values).toEqual([45000]);
  });

  it('accepts a seven-digit reading', () => {
    expect(bestOdometerPick(parseOdometerText('1234567'))).toBe(1234567);
  });

  it('falls back to the largest plausible reading when nothing is labeled', () => {
    const c = parseOdometerText('12345\n45000\n2000');
    expect(c.labeled).toEqual([]);
    expect(bestOdometerPick(c)).toBe(45000);
  });

  it('prefers the largest labeled reading when several are labeled', () => {
    const c = parseOdometerText('NEXT SERVICE 50000 km\nODO 45000 km');
    expect(bestOdometerPick(c)).toBe(50000);
    expect(c.values).toContain(45000);
  });

  it('returns null when there is no plausible reading', () => {
    expect(bestOdometerPick(parseOdometerText('hello world'))).toBeNull();
    expect(bestOdometerPick(parseOdometerText('320 km 22.5'))).toBeNull();
    expect(bestOdometerPick(parseOdometerText(''))).toBeNull();
  });

  it('deduplicates repeated readings', () => {
    const c = parseOdometerText('45000\n45000 km');
    expect(c.values).toEqual([45000]);
  });
});