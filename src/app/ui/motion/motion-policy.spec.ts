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
    expect(policy.allowWebGL('fillUpTank')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('allows only one WebGL surface at a time', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const policy = new MotionPolicy();
    expect(policy.claimWebGL('fillUpTank')).toBe(true);
    expect(policy.claimWebGL('homeAmbient')).toBe(false);
    policy.releaseWebGL('fillUpTank');
    expect(policy.claimWebGL('homeAmbient')).toBe(true);
    vi.unstubAllGlobals();
  });
});
