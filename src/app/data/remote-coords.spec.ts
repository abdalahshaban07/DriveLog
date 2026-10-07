import { describe, expect, it } from 'vitest';
import { parseIpCoords, parsePhotonPoint, photonSearchUrl, readCoords } from './remote';

function position(lat: number, lon: number): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
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
  };
}

describe('readCoords', () => {
  it('keeps an approximate fix and does not ask for precise GPS', async () => {
    let calls = 0;
    const geo = {
      getCurrentPosition() {},
      clearWatch() {},
      watchPosition(success: PositionCallback, _error: PositionErrorCallback | null, options?: PositionOptions) {
        calls += 1;
        expect(options?.enableHighAccuracy).toBe(false);
        success(position(30.04, 31.23));
        return 1;
      },
    } as Geolocation;
    await expect(readCoords(geo)).resolves.toEqual({ lat: 30.04, lon: 31.23 });
    expect(calls).toBe(1);
  });

  it('tries precise GPS after approximate is denied', async () => {
    const seen: boolean[] = [];
    const steps: Array<'deny' | { lat: number; lon: number }> = [
      'deny',
      { lat: 30.1, lon: 31.2 },
    ];
    const geo = {
      getCurrentPosition() {},
      clearWatch() {},
      watchPosition(
        success: PositionCallback,
        error: PositionErrorCallback | null,
        options?: PositionOptions,
      ) {
        seen.push(options?.enableHighAccuracy === true);
        const step = steps.shift();
        if (!step || step === 'deny') {
          error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
        } else {
          success(position(step.lat, step.lon));
        }
        return seen.length;
      },
    } as Geolocation;
    await expect(readCoords(geo)).resolves.toEqual({ lat: 30.1, lon: 31.2 });
    expect(seen).toEqual([false, true]);
  });

  it('keeps listening after a temporary location error', async () => {
    let successFn: PositionCallback = () => {};
    const geo = {
      getCurrentPosition() {},
      clearWatch() {},
      watchPosition(success: PositionCallback, error: PositionErrorCallback | null) {
        successFn = success;
        error?.({ code: 2, message: 'unavailable' } as GeolocationPositionError);
        return 7;
      },
    } as Geolocation;
    const pending = readCoords(geo);
    successFn(position(1, 2));
    await expect(pending).resolves.toEqual({ lat: 1, lon: 2 });
  });
});

describe('parsePhotonPoint', () => {
  it('reads lon, lat from the first feature', () => {
    expect(
      parsePhotonPoint({
        features: [{ geometry: { coordinates: [31.34, 30.05] } }],
      }),
    ).toEqual({ lat: 30.05, lon: 31.34 });
  });

  it('returns null when the payload has no point', () => {
    expect(parsePhotonPoint({ features: [] })).toBeNull();
    expect(parsePhotonPoint(null)).toBeNull();
  });
});

describe('parseIpCoords', () => {
  it('reads string latitude and longitude', () => {
    expect(parseIpCoords({ latitude: '30.04', longitude: '31.24' })).toEqual({
      lat: 30.04,
      lon: 31.24,
    });
  });

  it('returns null when the payload has no point', () => {
    expect(parseIpCoords(null)).toBeNull();
    expect(parseIpCoords({ latitude: 'nope', longitude: '31' })).toBeNull();
    expect(parseIpCoords({ latitude: '91', longitude: '0' })).toBeNull();
  });
});

describe('photonSearchUrl', () => {
  it('does not send lang=ar', () => {
    const url = photonSearchUrl('القاهره', 'ar');
    expect(url).toContain('lang=default');
    expect(url).not.toContain('lang=ar');
  });
});
