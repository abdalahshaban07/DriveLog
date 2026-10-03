import { describe, expect, it } from 'vitest';
import { readCoords } from './remote';

function fakeGeo(steps: Array<'fail' | CoordsLike>): Geolocation {
  const queue = [...steps];
  return {
    getCurrentPosition(success, error) {
      const step = queue.shift();
      if (!step || step === 'fail') {
        error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
        return;
      }
      success({
        coords: {
          latitude: step.lat,
          longitude: step.lon,
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON() {
            return {};
          },
        },
        timestamp: 0,
        toJSON() {
          return {};
        },
      });
    },
    watchPosition() {
      return 0;
    },
    clearWatch() {},
  };
}

type CoordsLike = { lat: number; lon: number };

describe('readCoords', () => {
  it('keeps an approximate fix and does not ask for precise GPS', async () => {
    let calls = 0;
    const geo = fakeGeo([{ lat: 30.04, lon: 31.23 }]);
    const orig = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (success, error, options) => {
      calls += 1;
      expect(options?.enableHighAccuracy).toBe(false);
      orig(success, error, options);
    };
    await expect(readCoords(geo)).resolves.toEqual({ lat: 30.04, lon: 31.23 });
    expect(calls).toBe(1);
  });

  it('tries precise GPS after approximate fails', async () => {
    const seen: boolean[] = [];
    const geo = fakeGeo(['fail', { lat: 30.1, lon: 31.2 }]);
    const orig = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (success, error, options) => {
      seen.push(options?.enableHighAccuracy === true);
      orig(success, error, options);
    };
    await expect(readCoords(geo)).resolves.toEqual({ lat: 30.1, lon: 31.2 });
    expect(seen).toEqual([false, true]);
  });
});
