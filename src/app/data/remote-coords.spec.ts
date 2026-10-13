import { describe, expect, it } from 'vitest';
import {
  mapsSearchUrl,
  parseIpCoords,
  readCoords,
  searchAreas,
  shortenPlaceQuery,
  type AreaRow,
  type StationsFile,
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

const areas: AreaRow[] = [
  ['نصر', 'Nasr', 27.52, 32.08],
  ['القاهره الجديدة', 'New Cairo', 29.99, 31.42],
  ['بنى سويف الجديده', 'New Beni suef', 28.97, 31.05],
  ['بني سويف', 'Beni Suef', 29.07, 31.09],
  ['', 'Nasr City', 30.03, 31.36],
];

const stations: StationsFile = {
  updated: '2026-10-01',
  fuel: [
    [30.06, 31.34, 'مصر للبترول مدينة نصر', 'Misr Petroleum'],
    [30.04, 31.36, 'توتال - مدينه نصر', 'TotalEnergies'],
  ],
  charge: [],
};

describe('searchAreas', () => {
  it('matches a district by its Arabic name, ignoring ة/ه and the block number', () => {
    expect(searchAreas(areas, stations, 'بني سويف الجديدة الحي الخامس', 'ar')).toEqual({
      lat: 28.97,
      lon: 31.05,
      label: 'بنى سويف الجديده',
    });
  });

  it('prefers the shorter exact name and labels in English', () => {
    expect(searchAreas(areas, stations, 'beni suef', 'en')?.label).toBe('Beni Suef');
    expect(searchAreas(areas, stations, 'Nasr City', 'en')?.lat).toBe(30.03);
  });

  it('falls back to station names before a looser district hit', () => {
    const place = searchAreas(areas, stations, 'مدينة نصر', 'ar');
    expect(place?.label).toBe('مدينة نصر');
    expect(place?.lat).toBeCloseTo(30.05);
    expect(place?.lon).toBeCloseTo(31.35);
  });

  it('returns null when nothing matches', () => {
    expect(searchAreas(areas, stations, 'zzzz', 'en')).toBeNull();
    expect(searchAreas(areas, null, '  ', 'ar')).toBeNull();
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
