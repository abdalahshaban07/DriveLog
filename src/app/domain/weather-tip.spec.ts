import { describe, expect, it } from 'vitest';
import { weatherTipKey } from './weather-tip';

describe('weatherTipKey', () => {
  it('prefers rain over temperature', () => {
    expect(weatherTipKey(40, 61)).toBe('home.weather.tip.rain');
  });

  it('flags heat on clear hot days', () => {
    expect(weatherTipKey(36, 0)).toBe('home.weather.tip.heat');
  });

  it('flags cold on clear cold days', () => {
    expect(weatherTipKey(2, 1)).toBe('home.weather.tip.cold');
  });

  it('returns clear for mild clear weather', () => {
    expect(weatherTipKey(22, 0)).toBe('home.weather.tip.clear');
  });

  it('returns snow for snow codes', () => {
    expect(weatherTipKey(-2, 71)).toBe('home.weather.tip.snow');
  });
});
