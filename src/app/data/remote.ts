const TIMEOUT_MS = 8000;
const PRICE_CACHE_KEY = 'drivelog.fuelPrices.v2';
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

export type Coords = { lat: number; lon: number };

export type VinDecode = {
  vin: string;
  year?: string;
  make?: string;
  model?: string;
};

export type WeatherNow = {
  lat: number;
  lon: number;
  tempC: number;
  weatherCode: number;
};

export type CountryFuelPrices = {
  countryCode: string;
  countryName: string;
  currency: string;
  /** Egypt solar (سولار); often diesel-grade. */
  solar: number | null;
  diesel: number | null;
  gasoline92: number | null;
  gasoline95: number | null;
  /** Legacy alias → gasoline92 when only a single gasoline grade exists. */
  gasoline: number | null;
};

/** Overpass search radii (m). Expand until results, cap 50 km. */
const NEARBY_RADII_M = [5_000, 15_000, 30_000, 50_000] as const;

export type NearbyPoi = {
  id: number;
  kind: 'fuel' | 'charge';
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  brand?: string;
  detail?: string;
};

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function getCoords(): Promise<Coords | null> {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

function pickField(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = row[key];
  if (v == null || v === '' || v === 'Not Applicable') {
    return undefined;
  }
  return String(v);
}

export function parseVinDecode(raw: unknown, vin: string): VinDecode | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const results = (raw as { Results?: unknown }).Results;
  if (!Array.isArray(results) || !results[0] || typeof results[0] !== 'object') {
    return null;
  }
  const row = results[0] as Record<string, unknown>;
  return {
    vin,
    year: pickField(row, 'ModelYear'),
    make: pickField(row, 'Make'),
    model: pickField(row, 'Model'),
  };
}

export async function decodeVin(vin: string): Promise<VinDecode | null> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  return parseVinDecode(await fetchJson(url), vin);
}

export function parseRecallCount(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const count = (raw as { count?: unknown }).count;
  if (typeof count === 'number' && Number.isFinite(count)) {
    return count;
  }
  const results = (raw as { results?: unknown }).results;
  if (Array.isArray(results)) {
    return results.length;
  }
  return null;
}

export async function recallsFor(
  make: string,
  model: string,
  year: string,
): Promise<number | null> {
  const q = new URLSearchParams({ make, model, modelYear: year });
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`;
  return parseRecallCount(await fetchJson(url));
}

export function parseWeather(raw: unknown, lat: number, lon: number): WeatherNow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const current = (raw as { current?: Record<string, unknown> }).current;
  if (!current) {
    return null;
  }
  const tempC = Number(current['temperature_2m']);
  const weatherCode = Number(current['weather_code']);
  if (!Number.isFinite(tempC) || !Number.isFinite(weatherCode)) {
    return null;
  }
  return { lat, lon, tempC, weatherCode };
}

export async function currentWeather(lat: number, lon: number): Promise<WeatherNow | null> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code',
  });
  return parseWeather(
    await fetchJson(`https://api.open-meteo.com/v1/forecast?${q}`),
    lat,
    lon,
  );
}

export function parseCountryFuelPrices(
  raw: unknown,
  countryCode: string,
): CountryFuelPrices | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const data = (raw as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const cc = countryCode.toUpperCase();
  const row = data[cc] ?? data[cc.toLowerCase()];
  if (!row || typeof row !== 'object') {
    return null;
  }
  const r = row as Record<string, unknown>;
  const prices = r['prices'];
  if (!prices || typeof prices !== 'object') {
    return null;
  }
  const p = prices as Record<string, unknown>;
  const solarRaw = pickPrice(p, ['solar', 'diesel_solar', 'gasoil']);
  const dieselRaw = pickPrice(p, ['diesel', 'diesel_regular', 'diesel_premium']);
  const gasoline92 = pickPrice(p, [
    'gasoline_92',
    'octane_92',
    'ron_92',
    'gasoline_regular',
    'gasoline',
  ]);
  const gasoline95 = pickPrice(p, [
    'gasoline_95',
    'octane_95',
    'ron_95',
    'gasoline_premium',
    'gasoline_super',
    'premium',
  ]);
  // Egypt site labels diesel-grade as Solar; public API often only sets diesel (+ gasoline/premium).
  const solar = solarRaw ?? (cc === 'EG' ? dieselRaw : null);
  const diesel =
    dieselRaw == null
      ? null
      : cc === 'EG' && solarRaw == null
        ? null
        : dieselRaw;

  return {
    countryCode: String(r['country_code'] ?? cc),
    countryName: String(r['country_name'] ?? cc),
    currency: String(r['local_currency'] ?? ''),
    solar,
    diesel,
    gasoline92,
    gasoline95,
    gasoline: gasoline92,
  };
}

function pickPrice(p: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = numOrNull(p[k]);
    if (n != null) {
      return n;
    }
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (v == null) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function countryFuelPrices(
  countryCode: string,
): Promise<CountryFuelPrices | null> {
  const cc = countryCode.toUpperCase();
  try {
    const cached = sessionStorage.getItem(PRICE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        at: number;
        by: Record<string, CountryFuelPrices>;
      };
      if (Date.now() - parsed.at < PRICE_TTL_MS && parsed.by[cc]) {
        return parsed.by[cc]!;
      }
    }
  } catch {
    /* ignore */
  }

  const raw = await fetchJson('https://openvan.camp/api/fuel/prices');
  const one = parseCountryFuelPrices(raw, cc);
  if (!one) {
    return null;
  }
  try {
    let by: Record<string, CountryFuelPrices> = {};
    const prev = sessionStorage.getItem(PRICE_CACHE_KEY);
    if (prev) {
      by = (JSON.parse(prev) as { by: Record<string, CountryFuelPrices> }).by ?? {};
    }
    by[cc] = one;
    sessionStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ at: Date.now(), by }));
  } catch {
    /* ignore */
  }
  return one;
}

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function parseNearbyPoi(
  raw: unknown,
  origin: Coords,
): NearbyPoi[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const elements = (raw as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) {
    return [];
  }
  const list: NearbyPoi[] = [];
  for (const el of elements) {
    if (!el || typeof el !== 'object') {
      continue;
    }
    const e = el as Record<string, unknown>;
    const center = e['center'] as { lat?: unknown; lon?: unknown } | undefined;
    const lat = Number(e['lat'] ?? center?.lat);
    const lon = Number(e['lon'] ?? center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const tags = (e['tags'] ?? {}) as Record<string, string>;
    const amenity = tags['amenity'];
    const kind: 'fuel' | 'charge' | null =
      amenity === 'fuel' || tags['shop'] === 'fuel'
        ? 'fuel'
        : amenity === 'charging_station'
          ? 'charge'
          : null;
    if (!kind) {
      continue;
    }
    const name =
      tags['name'] || tags['brand'] || tags['operator'] || (kind === 'fuel' ? 'Gas station' : 'Charger');
    const detail =
      kind === 'fuel'
        ? [tags['fuel:diesel'] === 'yes' ? 'diesel' : '', tags['fuel:octane_95'] === 'yes' ? '95' : '']
            .filter(Boolean)
            .join(' · ') || undefined
        : tags['socket:type2'] === 'yes'
          ? 'Type2'
          : tags['socket:ccs'] === 'yes'
            ? 'CCS'
            : undefined;
    list.push({
      id: Number(e['id']),
      kind,
      name,
      lat,
      lon,
      distanceKm: haversineKm(origin, { lat, lon }),
      brand: tags['brand'],
      detail,
    });
  }
  return list.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 10);
}

export async function nearbyPoi(
  origin: Coords,
  preferKind?: 'fuel' | 'charge',
): Promise<NearbyPoi[]> {
  let last: NearbyPoi[] = [];
  for (const radiusM of NEARBY_RADII_M) {
    last = await fetchNearbyAt(origin, radiusM);
    const hit = preferKind
      ? last.filter((p) => p.kind === preferKind)
      : last;
    if (hit.length) {
      return last;
    }
  }
  return last;
}

async function fetchNearbyAt(
  origin: Coords,
  radiusM: number,
): Promise<NearbyPoi[]> {
  // Nodes + ways (stations often mapped as areas); shop=fuel covers a few brand footprints.
  const q = `[out:json][timeout:25];
(
  node["amenity"="fuel"](around:${radiusM},${origin.lat},${origin.lon});
  way["amenity"="fuel"](around:${radiusM},${origin.lat},${origin.lon});
  node["shop"="fuel"](around:${radiusM},${origin.lat},${origin.lon});
  way["shop"="fuel"](around:${radiusM},${origin.lat},${origin.lon});
  node["amenity"="charging_station"](around:${radiusM},${origin.lat},${origin.lon});
  way["amenity"="charging_station"](around:${radiusM},${origin.lat},${origin.lon});
);
out center;`;
  const raw = await fetchJson(
    'https://overpass-api.de/api/interpreter',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
    },
    25_000,
  );
  return parseNearbyPoi(raw, origin);
}

export function mapsSearchUrl(lat: number, lon: number, lang: 'en' | 'ar'): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}&hl=${lang}`;
}

export function lastFillUnitPrice(
  liters: number,
  cost: number,
): number | null {
  if (!(liters > 0) || !Number.isFinite(cost)) {
    return null;
  }
  return cost / liters;
}
