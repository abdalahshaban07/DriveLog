import { parsePublicHolidays, type PublicHoliday } from '../domain/holidays';
const TIMEOUT_MS = 8000;
const PRICE_CACHE_KEY = 'drivelog.fuelPrices.v2';
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

export type Coords = { lat: number; lon: number };

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

/** Local station snapshot under the app base href, so it works on GitHub Pages and offline. */
const DATA_DIR = 'data/';
const DATA_TIMEOUT_MS = 15_000;

/** Fill-up suggestion radii (km). Expand until results, cap 50 km. */
const NEARBY_RADII_KM = [5, 15, 30, 50] as const;
const NEARBY_LIMIT = 20;
const AROUND_LIMIT = 40;

export type NearbyConnector = {
  type: string;
  powerKw?: number;
  count?: number;
  speed?: 'fast' | 'medium' | 'slow';
};

export type NearbyPoi = {
  id: number;
  kind: 'fuel' | 'charge';
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  brand?: string;
  detail?: string;
  addressLine?: string;
  openNow?: boolean | null;
  openingHours?: string;
  connectors?: NearbyConnector[];
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

/** Coarse first. A precise-only watch times out when Android granted approximate location. */
const GEO_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, timeout: 8_000, maximumAge: 120_000 },
  { enableHighAccuracy: true, timeout: 8_000, maximumAge: 15_000 },
];

/** watchPosition: Android often errors once, then delivers a fix. Code 1 is a hard deny. */
function watchOnce(geo: Geolocation, options: PositionOptions): Promise<Coords | null> {
  return new Promise((resolve) => {
    let settled = false;
    let watchId = 0;
    const stop = () => {
      if (watchId) {
        geo.clearWatch(watchId);
      }
    };
    const finish = (coords: Coords | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stop();
      resolve(coords);
    };
    const timer = setTimeout(() => finish(null), options.timeout ?? 8_000);
    watchId = geo.watchPosition(
      (pos) =>
        finish({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) {
          finish(null);
        }
      },
      options,
    );
    // A sync success runs before watchPosition returns the id.
    if (settled) {
      stop();
    }
  });
}

function attemptCoords(geo: Geolocation, index: number): Promise<Coords | null> {
  const options = GEO_ATTEMPTS[index];
  if (!options) {
    return Promise.resolve(null);
  }
  // The first watch must start in the click turn, or mobile browsers skip the prompt.
  return watchOnce(geo, options).then((coords) =>
    coords ? coords : attemptCoords(geo, index + 1),
  );
}

export function readCoords(geo: Geolocation): Promise<Coords | null> {
  return attemptCoords(geo, 0);
}

export type GeocodedPlace = Coords & { label: string };

/** Dropped only when they introduce a block number, as in «الحي الخامس». «التجمع الخامس» stays. */
const BLOCK_WORD = new Set(['حي', 'مجاوره']);

const BLOCK_ORDINAL = new Set([
  'اول',
  'اولي',
  'ثاني',
  'ثانيه',
  'تاني',
  'تانيه',
  'ثالث',
  'ثالثه',
  'تالت',
  'تالته',
  'رابع',
  'رابعه',
  'خامس',
  'خامسه',
  'سادس',
  'سادسه',
  'سابع',
  'سابعه',
  'ثامن',
  'ثامنه',
  'تامن',
  'تامنه',
  'تاسع',
  'تاسعه',
  'عاشر',
  'عاشره',
]);

function foldArabic(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

function foldToken(raw: string): string {
  return foldArabic(raw).replace(/^ال/, '');
}

function isNumberToken(token: string): boolean {
  return /^[\d\u0660-\u0669]+$/.test(token);
}

function placeTokens(raw: string): string[] {
  return foldArabic(raw)
    .split(/[^\u0600-\u06FFa-z0-9]+/i)
    .map((token) => token.replace(/^ال/, ''))
    .filter(Boolean);
}

/** «بني سويف الجديده الحي الخامس» → «بني سويف الجديدة». A bare «الخامس» stays. */
export function shortenPlaceQuery(query: string): string {
  const words = query.trim().split(/[^\u0600-\u06FFa-z0-9]+/i).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (BLOCK_WORD.has(foldToken(word))) {
      const next = words[i + 1];
      if (next) {
        const folded = foldToken(next);
        if (BLOCK_ORDINAL.has(folded) || isNumberToken(folded)) {
          i += 1;
        }
      }
      continue;
    }
    kept.push(word.endsWith('ه') ? `${word.slice(0, -1)}ة` : word);
  }
  return kept.join(' ').trim() || query.trim();
}

/** [arabic, english, lat, lon]. Hand-entered neighbourhoods, Ministry of Petroleum districts, geoBoundaries counties. */
export type AreaRow = [string, string, number, number];

/** 3 same words, 2 query is part of the name, 1 name is part of the query. */
function areaScore(query: string[], name: string): number {
  const words = placeTokens(name);
  if (!words.length || !query.length) {
    return 0;
  }
  const inName = query.every((token) => words.includes(token));
  const inQuery = words.every((token) => query.includes(token));
  return inName && inQuery ? 3 : inName ? 2 : inQuery ? 1 : 0;
}

/**
 * Local search, no network: a district name, else the stations whose names mention the place.
 * ponytail: linear scan over ~600 areas + ~3k stations; fine on a phone, index if the files grow 10×.
 */
export function searchAreas(
  areas: readonly AreaRow[],
  stations: StationsFile | null,
  query: string,
  lang: 'en' | 'ar',
): GeocodedPlace | null {
  const q = shortenPlaceQuery(query);
  const tokens = placeTokens(q);
  if (!tokens.length) {
    return null;
  }
  let best: AreaRow | null = null;
  let bestScore = 0;
  for (const row of areas) {
    const score = Math.max(areaScore(tokens, row[0]), areaScore(tokens, row[1]));
    const shorter = best && score === bestScore && placeTokens(row[0] || row[1]).length < placeTokens(best[0] || best[1]).length;
    if (score > bestScore || shorter) {
      best = row;
      bestScore = score;
    }
  }
  const label = (row: AreaRow) => (lang === 'ar' ? row[0] || row[1] : row[1] || row[0]);
  if (best && bestScore >= 2) {
    return { lat: best[2], lon: best[3], label: label(best) };
  }
  const hits = [...(stations?.fuel ?? []), ...(stations?.charge ?? [])].filter(
    (row) => areaScore(tokens, row[2]) === 2,
  );
  if (hits.length) {
    return {
      lat: hits.reduce((sum, row) => sum + row[0], 0) / hits.length,
      lon: hits.reduce((sum, row) => sum + row[1], 0) / hits.length,
      label: q,
    };
  }
  // A one-word district inside a longer query («نصر» in «مدينة نصر») is usually a different town.
  return best && placeTokens(best[0] || best[1]).length > 1
    ? { lat: best[2], lon: best[3], label: label(best) }
    : null;
}

let areasFile: Promise<AreaRow[] | null> | null = null;

function loadAreas(): Promise<AreaRow[] | null> {
  areasFile ??= fetchJson(`${DATA_DIR}eg-areas.json`, undefined, DATA_TIMEOUT_MS).then((raw) => {
    const areas = (raw as { areas?: unknown } | null)?.areas;
    if (!Array.isArray(areas)) {
      areasFile = null;
      return null;
    }
    return areas as AreaRow[];
  });
  return areasFile;
}

export async function geocodePlace(
  query: string,
  lang: 'en' | 'ar' = 'en',
): Promise<GeocodedPlace | null> {
  const [areas, stations] = await Promise.all([loadAreas(), loadStations()]);
  return searchAreas(areas ?? [], stations, query, lang);
}

export function getCoords(): Promise<Coords | null> {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }
  return readCoords(navigator.geolocation);
}

/** geojs returns latitude/longitude as strings. No key. */
export function parseIpCoords(raw: unknown): Coords | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const row = raw as { latitude?: unknown; longitude?: unknown };
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

/** City-level fix when GPS is denied or never answers. */
export async function coarseCoords(): Promise<Coords | null> {
  return parseIpCoords(await fetchJson('https://get.geojs.io/v1/ip/geo.json'));
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

/** Baked by scripts/build-eg-data.py. fuel: [lat, lon, name, brand]; charge: [lat, lon, name, network, maxKw]. */
export type StationsFile = {
  updated: string;
  fuel: [number, number, string, string | null][];
  charge: [number, number, string, string | null, number | null][];
};

let stationsFile: Promise<StationsFile | null> | null = null;

function loadStations(): Promise<StationsFile | null> {
  stationsFile ??= fetchJson(`${DATA_DIR}eg-stations.json`, undefined, DATA_TIMEOUT_MS).then((raw) => {
    const file = raw as Partial<StationsFile> | null;
    if (!file || !Array.isArray(file.fuel) || !Array.isArray(file.charge)) {
      stationsFile = null;
      return null;
    }
    return file as StationsFile;
  });
  return stationsFile;
}

/** Date the station snapshot was baked, for the source line. */
export async function stationsUpdated(): Promise<string | null> {
  return (await loadStations())?.updated ?? null;
}

const CHARGE_ID_OFFSET = 1_000_000;

export function stationsNear(
  file: StationsFile,
  origin: Coords,
  radiusKm: number,
  limit = NEARBY_LIMIT,
  kind?: 'fuel' | 'charge',
): NearbyPoi[] {
  const list: NearbyPoi[] = [];
  // ponytail: full scan of ~3k rows per search; cheap next to a network call.
  (kind === 'charge' ? [] : file.fuel).forEach(([lat, lon, name, brand], i) => {
    const distanceKm = haversineKm(origin, { lat, lon });
    if (distanceKm <= radiusKm) {
      list.push({ id: i, kind: 'fuel', name: name || brand || 'Gas station', lat, lon, distanceKm, brand: brand ?? undefined });
    }
  });
  (kind === 'fuel' ? [] : file.charge).forEach(([lat, lon, name, network, maxKw], i) => {
    const distanceKm = haversineKm(origin, { lat, lon });
    if (distanceKm <= radiusKm) {
      list.push({
        id: CHARGE_ID_OFFSET + i,
        kind: 'charge',
        name: name || network || 'Charger',
        lat,
        lon,
        distanceKm,
        brand: network ?? undefined,
        detail: maxKw ? `${maxKw} kW` : undefined,
      });
    }
  });
  return list.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

export async function nearbyPoi(
  origin: Coords,
  preferKind?: 'fuel' | 'charge',
): Promise<NearbyPoi[]> {
  const file = await loadStations();
  if (!file) {
    return [];
  }
  let last: NearbyPoi[] = [];
  for (const radiusKm of NEARBY_RADII_KM) {
    last = stationsNear(file, origin, radiusKm);
    if (last.some((p) => !preferKind || p.kind === preferKind)) {
      return last;
    }
  }
  return last;
}

/** Around page: one user radius, doubled once when empty. Missing data file throws. */
export async function nearbyAround(
  origin: Coords,
  radiusKm = 15,
  kind?: 'fuel' | 'charge',
): Promise<NearbyPoi[]> {
  const file = await loadStations();
  if (!file) {
    throw new Error('nearby-unavailable');
  }
  const km = Number.isFinite(radiusKm) ? Math.min(300, Math.max(1, Math.round(radiusKm))) : 15;
  const first = stationsNear(file, origin, km, AROUND_LIMIT, kind);
  return first.length ? first : stationsNear(file, origin, Math.min(300, km * 2), AROUND_LIMIT, kind);
}

export function mapsSearchUrl(
  lat: number,
  lon: number,
  lang: 'en' | 'ar',
  origin?: Coords | null,
): string {
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${lat},${lon}&hl=${lang}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}&hl=${lang}`;
}

/** ponytail: ipapi.co free tier, no key; fails offline */
export async function detectCountryCurrency(): Promise<string | null> {
  const raw = (await fetchJson('https://ipapi.co/json/')) as {
    currency?: string;
  } | null;
  if (raw?.currency && typeof raw.currency === 'string') {
    return raw.currency.toUpperCase();
  }
  return null;
}

const HOLIDAY_CACHE_KEY = 'drivelog.holidays.v1';
const HOLIDAY_TTL_MS = 24 * 60 * 60 * 1000;
const REST_COUNTRIES_CACHE_KEY = 'drivelog.restcountries.v1';
const REST_COUNTRIES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function publicHolidays(
  countryCode: string,
  year: number,
): Promise<PublicHoliday[]> {
  const cc = countryCode.toUpperCase();
  const cacheKey = `${cc}_${year}`;
  try {
    const cached = sessionStorage.getItem(HOLIDAY_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        at: number;
        by: Record<string, PublicHoliday[]>;
      };
      if (Date.now() - parsed.at < HOLIDAY_TTL_MS && parsed.by[cacheKey]) {
        return parsed.by[cacheKey]!;
      }
    }
  } catch {
    /* ignore */
  }
  const raw = await fetchJson(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(cc)}`,
  );
  const list = parsePublicHolidays(raw);
  try {
    const prev = sessionStorage.getItem(HOLIDAY_CACHE_KEY);
    const parsed = prev
      ? (JSON.parse(prev) as {
          at: number;
          by: Record<string, PublicHoliday[]>;
        })
      : { at: Date.now(), by: {} };
    parsed.at = Date.now();
    parsed.by[cacheKey] = list;
    sessionStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
  return list;
}

export type RestCountryCurrency = { code: string; name: string; flag: string };

export function parseRestCountries(raw: unknown): RestCountryCurrency[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const map = new Map<string, RestCountryCurrency>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const o = row as Record<string, unknown>;
    const flag = typeof o['flag'] === 'string' ? o['flag'] : '';
    const currencies = o['currencies'];
    if (!currencies || typeof currencies !== 'object') {
      continue;
    }
    for (const [code, meta] of Object.entries(currencies as Record<string, unknown>)) {
      const cc = code.toUpperCase();
      if (!/^[A-Z]{3}$/.test(cc) || map.has(cc)) {
        continue;
      }
      const name =
        meta && typeof meta === 'object' && typeof (meta as { name?: unknown }).name === 'string'
          ? String((meta as { name: string }).name)
          : cc;
      map.set(cc, { code: cc, name, flag });
    }
  }
  return [...map.values()];
}

export async function restCountryCurrencies(): Promise<RestCountryCurrency[]> {
  try {
    const cached = sessionStorage.getItem(REST_COUNTRIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { at: number; list: RestCountryCurrency[] };
      if (Date.now() - parsed.at < REST_COUNTRIES_TTL_MS && parsed.list.length) {
        return parsed.list;
      }
    }
  } catch {
    /* ignore */
  }
  const raw = await fetchJson(
    'https://restcountries.com/v3.1/all?fields=name,currencies,flag',
    undefined,
    15_000,
  );
  const list = parseRestCountries(raw);
  if (list.length) {
    try {
      sessionStorage.setItem(
        REST_COUNTRIES_CACHE_KEY,
        JSON.stringify({ at: Date.now(), list }),
      );
    } catch {
      /* ignore */
    }
  }
  return list;
}
