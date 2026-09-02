import { describe, expect, it } from 'vitest';
import { linearScale, niceTicks } from './scale';

describe('niceTicks', () => {
  it('returns a single tick when min equals max at zero', () => {
    expect(niceTicks(0, 0)).toEqual([0]);
  });

  it('returns nice round ticks spanning the domain', () => {
    const ticks = niceTicks(0, 100, 5);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(100);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it('handles reversed domains', () => {
    expect(niceTicks(100, 0, 4)).toEqual(niceTicks(0, 100, 4));
  });

  it('handles negative domains', () => {
    const ticks = niceTicks(-50, 50, 5);
    expect(ticks.some((t) => t <= -50)).toBe(true);
    expect(ticks.some((t) => t >= 50)).toBe(true);
  });
});

describe('linearScale', () => {
  it('maps domain endpoints to range endpoints', () => {
    const scale = linearScale([0, 100], [0, 200]);
    expect(scale(0)).toBe(0);
    expect(scale(100)).toBe(200);
    expect(scale(50)).toBe(100);
  });

  it('exposes ticks from niceTicks', () => {
    const scale = linearScale([0, 10], [0, 100], 4);
    const ticks = scale.ticks();
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
  });

  it('handles flat domain without dividing by zero', () => {
    const scale = linearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(0);
  });
});
