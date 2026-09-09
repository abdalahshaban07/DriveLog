import { describe, expect, it, vi } from 'vitest';
import { MotionPolicy } from './motion-policy';

describe('MotionPolicy', () => {
  it('blocks anime when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const policy = new MotionPolicy();
    expect(policy.allowAnime('ledger')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('allows anime when reduced motion is off', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const policy = new MotionPolicy();
    expect(policy.allowAnime('receipt')).toBe(true);
    vi.unstubAllGlobals();
  });
});
