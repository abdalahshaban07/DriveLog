import { describe, expect, it } from 'vitest';
import { odometerInputValue, roundOdometerKm } from './odometer';

describe('odometer', () => {
  it('rounds float artifacts to integer km', () => {
    expect(roundOdometerKm(333703.100000003)).toBe(333703);
    expect(roundOdometerKm(10.4)).toBe(10);
    expect(roundOdometerKm(10.5)).toBe(11);
  });

  it('formats input priming without decimals', () => {
    expect(odometerInputValue(333703.100000003)).toBe('333703');
    expect(odometerInputValue(undefined)).toBe('');
    expect(odometerInputValue(Number.NaN)).toBe('');
  });
});
