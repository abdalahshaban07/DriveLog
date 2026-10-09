import { describe, expect, it } from 'vitest';
import {
  mapsSearchUrl,
  parseIpCoords,
  parsePhotonPoint,
  photonSearchUrl,
  pickPhotonPlace,
  shortenPlaceQuery,
  readAroundCache,
  readCoords,
  writeAroundCache,
  type AroundCache,
} from './remote';

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
    expect(url).toContain('limit=8');
    expect(url).toContain('bbox=24.7%2C22%2C36.9%2C31.7');
  });
});

const beniSuefHits = {
  features: [
    {
      geometry: { coordinates: [30.923149, 29.9397396] },
      properties: {
        name: 'مدرسة 6 أكتوبر الأبتدائية الجديدة',
        city: 'مدينة 6 أكتوبر',
        district: 'الحى الخامس',
        locality: 'المجاورة 3',
        state: 'الجيزة',
      },
    },
    {
      geometry: { coordinates: [31.1244432, 29.0409555] },
      properties: {
        name: 'محور الجامعه',
        city: 'New Bani Suef City',
        locality: 'المجاورة 3',
        state: 'بنى سويف',
      },
    },
  ],
};

describe('shortenPlaceQuery', () => {
  it('drops the block words and restores ة', () => {
    expect(shortenPlaceQuery('بني سويف الجديده الحي الخامس')).toBe('بني سويف الجديدة');
    expect(shortenPlaceQuery('بني سويف الجديده الحي الخامس المجاوره الخامسه')).toBe(
      'بني سويف الجديدة',
    );
  });

  it('keeps a number that is part of the place name', () => {
    expect(shortenPlaceQuery('التجمع الخامس')).toBe('التجمع الخامس');
    expect(shortenPlaceQuery('المعادي')).toBe('المعادي');
    expect(shortenPlaceQuery('مدينة نصر')).toBe('مدينة نصر');
  });
});

describe('pickPhotonPlace', () => {
  it('prefers بني سويف over the 6th of October school', () => {
    expect(
      pickPhotonPlace(beniSuefHits, 'بني سويف الجديده الحي الخامس المجاوره الخامسه'),
    ).toEqual({
      lat: 29.0409555,
      lon: 31.1244432,
      label: 'بنى سويف · New Bani Suef City',
    });
  });

  it('keeps the city whose name is the query, not a road inside it', () => {
    expect(
      pickPhotonPlace(
        {
          features: [
            {
              geometry: { coordinates: [31.8704, 28.9355] },
              properties: {
                name: 'طريق الزعفرانه, بنى سويف',
                city: 'بني سويف الجديدة',
                state: 'بنى سويف',
                osm_value: 'motorway',
              },
            },
            {
              geometry: { coordinates: [31.1068, 29.0321] },
              properties: {
                name: 'بني سويف الجديدة',
                state: 'بنى سويف',
                osm_value: 'city',
              },
            },
          ],
        },
        'بني سويف الجديدة',
      ),
    ).toEqual({
      lat: 29.0321,
      lon: 31.1068,
      label: 'بني سويف الجديدة',
    });
  });

  it('prefers the city when a street matches the same governorate', () => {
    expect(
      pickPhotonPlace(
        {
          features: [
            {
              geometry: { coordinates: [31.20513, 29.33166] },
              properties: {
                name: 'شارع الحديده',
                city: 'مدينه الواسطى',
                state: 'بنى سويف',
                osm_value: 'residential',
              },
            },
            {
              geometry: { coordinates: [31.1068, 29.0321] },
              properties: {
                name: 'بني سويف الجديدة',
                state: 'بنى سويف',
                osm_value: 'city',
              },
            },
          ],
        },
        'بني سويف',
      ),
    ).toEqual({
      lat: 29.0321,
      lon: 31.1068,
      label: 'بني سويف الجديدة',
    });
  });

  it('keeps the first hit when nothing distinctive matches', () => {
    expect(pickPhotonPlace(beniSuefHits, 'zzzz')?.lat).toBe(29.9397396);
    expect(pickPhotonPlace({ features: [] }, 'بني سويف')).toBeNull();
  });
});

describe('mapsSearchUrl', () => {
  it('routes from the search point to the station', () => {
    expect(
      mapsSearchUrl(29.05, 31.13, 'ar', { lat: 29.0409555, lon: 31.1244432 }),
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=29.0409555,31.1244432&destination=29.05,31.13&hl=ar',
    );
  });
});

describe('around cache', () => {
  it('roundtrips the last station list and rejects junk', () => {
    const storage = new Map<string, string>();
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    } as Storage;
    const saved: AroundCache = {
      lat: 30.04,
      lon: 31.24,
      radiusKm: 8,
      savedAt: 1,
      items: [
        {
          id: 1,
          kind: 'fuel',
          name: 'توتال',
          lat: 30.05,
          lon: 31.25,
          distanceKm: 0.4,
        },
      ],
    };
    writeAroundCache(saved, memory);
    expect(readAroundCache(memory)).toEqual(saved);
    writeAroundCache({ ...saved, items: [] }, memory);
    expect(readAroundCache(memory)).toEqual(saved);
    memory.setItem('drivelog.around.v1', '{');
    expect(readAroundCache(memory)).toBeNull();
  });
});
