import { describe, expect, it } from 'vitest';
import { approxDriveMinutes, radarPoint, radarRangeKm, radarSnake } from './around-radar';

const cairo = { lat: 30.04, lon: 31.23 };

describe('radarPoint', () => {
  it('puts north up and east right', () => {
    const north = radarPoint(cairo, { lat: 30.085, lon: 31.23 }, 10);
    expect(north.x).toBe(50);
    expect(north.y).toBeLessThan(50);
    const east = radarPoint(cairo, { lat: 30.04, lon: 31.3 }, 10);
    expect(east.x).toBeGreaterThan(50);
    expect(east.y).toBe(50);
  });

  it('pins far points to the rim', () => {
    const far = radarPoint(cairo, { lat: 31.04, lon: 31.23 }, 10);
    expect(far).toEqual({ x: 50, y: 4 });
  });
});

describe('radarRangeKm', () => {
  it('picks the smallest ring that holds the farthest station', () => {
    expect(radarRangeKm([0.4, 1.8])).toBe(2);
    expect(radarRangeKm([3, 7.5])).toBe(10);
    expect(radarRangeKm([])).toBe(2);
    expect(radarRangeKm([64.2])).toBe(65);
  });
});

describe('radarSnake', () => {
  it('runs an S from the centre to the station along the longer axis', () => {
    expect(radarSnake({ x: 80, y: 40 })).toEqual({
      d: 'M50 50 C71 50 59 40 80 40',
      mid: { x: 65, y: 45 },
    });
    expect(radarSnake({ x: 45, y: 10 }).d).toBe('M50 50 C50 22 45 38 45 10');
  });
});

describe('approxDriveMinutes', () => {
  it('assumes a 1.3× road at 30 km/h, never under a minute', () => {
    expect(approxDriveMinutes(10)).toBe(26);
    expect(approxDriveMinutes(0.05)).toBe(1);
  });
});
