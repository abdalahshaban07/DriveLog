import { describe, expect, it } from 'vitest';
import { isOpenNow } from './opening-hours';

describe('isOpenNow', () => {
  it('returns null for empty or unknown rules', () => {
    expect(isOpenNow(undefined)).toBeNull();
    expect(isOpenNow('')).toBeNull();
    expect(isOpenNow('Mo-Fr 08:00-12:00,13:00-18:00')).toBeNull();
    expect(isOpenNow('PH off')).toBeNull();
  });

  it('treats 24/7 as always open', () => {
    expect(isOpenNow('24/7')).toBe(true);
    expect(isOpenNow('24/7;')).toBe(true);
  });

  it('evaluates Mo-Su HH:MM-HH:MM against a fixed clock', () => {
    // Wednesday 2026-09-09 15:00 local
    const wed = new Date(2026, 8, 9, 15, 0, 0);
    expect(isOpenNow('Mo-Su 08:00-22:00', wed)).toBe(true);
    expect(isOpenNow('Mo-Su 08:00-14:00', wed)).toBe(false);

    const sun = new Date(2026, 8, 6, 10, 0, 0);
    expect(isOpenNow('Mo-Fr 08:00-18:00', sun)).toBe(false);
    expect(isOpenNow('Mo-Fr 08:00-18:00', wed)).toBe(true);
  });

  it('handles overnight windows', () => {
    const late = new Date(2026, 8, 9, 23, 30, 0);
    const early = new Date(2026, 8, 10, 2, 0, 0);
    expect(isOpenNow('Mo-Su 22:00-06:00', late)).toBe(true);
    expect(isOpenNow('Mo-Su 22:00-06:00', early)).toBe(true);
    expect(isOpenNow('Mo-Su 22:00-06:00', new Date(2026, 8, 9, 12, 0, 0))).toBe(
      false,
    );
  });
});
