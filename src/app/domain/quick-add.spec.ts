import { describe, expect, it } from 'vitest';
import type { CountryFuelPrices } from '../data/remote';
import {
  computeFillUpCost,
  needsManualUnitPrice,
  pickUnitPrice,
  resolveUnitPrice,
} from './fill-up-cost';
import { buildGradeOptions } from '../ui/fuel-grade-selector';
import type { MsgKey } from '../i18n/en';
import type { FuelGrade } from './models';

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

const GRADE_KEYS: Record<FuelGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
  custom: 'fillUp.lastPaid',
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

  it('buildGradeOptions lists grades even without prices', () => {
    const opts = buildGradeOptions(null, GRADE_KEYS);
    expect(opts).toHaveLength(4);
    expect(opts.every((o) => o.price == null)).toBe(true);
  });

  it('resolveUnitPrice uses manual when board missing', () => {
    expect(needsManualUnitPrice('gasoline92', null)).toBe(true);
    expect(resolveUnitPrice('gasoline92', null, null, 13.5)).toBe(13.5);
    expect(resolveUnitPrice('gasoline95', board, null, 99)).toBe(14.2);
  });
});
