import { describe, expect, it } from 'vitest';
import { sanitizeDecimal } from './numeric-field';

describe('sanitizeDecimal', () => {
  it('drops letters and extra dots', () => {
    expect(sanitizeDecimal('gdfgdfg')).toBe('');
    expect(sanitizeDecimal('12a3.4.5')).toBe('123.45');
    expect(sanitizeDecimal('104500')).toBe('104500');
  });
});
