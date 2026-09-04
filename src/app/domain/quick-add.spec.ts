import { describe, expect, it } from 'vitest';
import type { CountryFuelPrices } from '../data/remote';
import { computeFillUpCost, pickUnitPrice } from './fill-up-cost';

const board: CountryFuelPrices = {
  countryCode: 'EG',
  countryName: 'Egypt',
  currency: 'EGP',
  solar: 10,
  diesel: 11,
  gasoline92: 12,
  gasoline95: 14.2,
  gasoline: 12,
};

/** Quick-add must use the same cost/price helpers as the full fill-up form. */
describe('quick-add cost helpers', () => {
  it('computeFillUpCost matches liters × unit (2dp)', () => {
    expect(computeFillUpCost(40, 12.5)).toBe(500);
    expect(computeFillUpCost(33.3, 10.123)).toBe(337.1);
  });

  it('pickUnitPrice prefers board price then last fill', () => {
    expect(pickUnitPrice('gasoline95', board, 9)).toBe(14.2);
    expect(pickUnitPrice('custom', null, 11.5)).toBe(11.5);
    expect(pickUnitPrice(null, null, null)).toBeNull();
  });
});
