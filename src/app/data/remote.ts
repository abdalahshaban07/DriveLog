import { parsePublicHolidays, type PublicHoliday } from '../domain/holidays';
import { isOpenNow } from '../domain/opening-hours';

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

/** Overpass search radii (m). Expand until results, cap 50 km. */
const NEARBY_RADII_M = [5_000, 15_000, 30_000, 50_000] as const;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
] as const;

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

/** Photon GeoJSON: coordinates are [lon, lat]. No key. */
export function parsePhotonPoint(raw: unknown): Coords | null {
  const hit = photonHits(raw)[0];
  return hit ? { lat: hit.lat, lon: hit.lon } : null;
}

export type GeocodedPlace = Coords & { label: string };

type PhotonHit = Coords & {
  name: string;
  city: string;
  state: string;
  county: string;
  district: string;
  locality: string;
  kind: string;
};

/** Address words that also exist in 6th of October, so they must not outrank a city name. */
const GENERIC_PLACE = new Set([
  'حي',
  'خامس',
  'خامسه',
  'مجاوره',
  'مدينه',
]);

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

const SETTLEMENT = new Set([
  'city',
  'town',
  'suburb',
  'neighbourhood',
  'neighborhood',
  'administrative',
  'village',
  'locality',
  'hamlet',
  'quarter',
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

function placeTokens(raw: string): string[] {
  return foldArabic(raw)
    .split(/[^\u0600-\u06FFa-z0-9]+/i)
    .map((token) => token.replace(/^ال/, ''))
    .filter((token) => token && !GENERIC_PLACE.has(token) && !isNumberToken(token));
}

function foldToken(raw: string): string {
  return foldArabic(raw).replace(/^ال/, '');
}

function isNumberToken(token: string): boolean {
  return /^[\d\u0660-\u0669]+$/.test(token);
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

function photonText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function photonHits(raw: unknown): PhotonHit[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    return [];
  }
  const hits: PhotonHit[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') {
      continue;
    }
    const coordinates = (feature as { geometry?: { coordinates?: unknown } }).geometry
      ?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      continue;
    }
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const props = (feature as { properties?: Record<string, unknown> }).properties ?? {};
    hits.push({
      lat,
      lon,
      name: photonText(props['name']),
      city: photonText(props['city']),
      state: photonText(props['state']),
      county: photonText(props['county']),
      district: photonText(props['district']),
      locality: photonText(props['locality']),
      kind: photonText(props['osm_value']) || photonText(props['type']),
    });
  }
  return hits;
}

function photonScore(query: string[], hit: PhotonHit): number {
  const region = new Set([...placeTokens(hit.state), ...placeTokens(hit.county), ...placeTokens(hit.city)]);
  const near = new Set([...placeTokens(hit.district), ...placeTokens(hit.locality)]);
  const name = new Set(placeTokens(hit.name));
  let score = 0;
  for (const token of query) {
    if (region.has(token)) {
      score += 3;
    } else if (near.has(token)) {
      score += 2;
    } else if (name.has(token)) {
      score += 1;
    }
  }
  return score;
}

function isSettlement(hit: PhotonHit): boolean {
  return SETTLEMENT.has(hit.kind);
}

function coversQuery(tokens: string[], hit: PhotonHit): boolean {
  if (!tokens.length) {
    return false;
  }
  const name = new Set(placeTokens(hit.name));
  return tokens.every((token) => name.has(token));
}

function photonLabel(hit: PhotonHit): string {
  if (isSettlement(hit) && hit.name) {
    return hit.name;
  }
  const state = hit.state;
  const city = hit.city;
  if (state && city && foldArabic(state) !== foldArabic(city)) {
    return `${state} · ${city}`;
  }
  return state || city || hit.name;
}

/** First hit when nothing distinctive matches. Otherwise the highest score; ties keep Photon order, then a city over a street. */
export function pickPhotonPlace(raw: unknown, query: string): GeocodedPlace | null {
  const hits = photonHits(raw);
  const first = hits[0];
  if (!first) {
    return null;
  }
  const tokens = placeTokens(query);
  let best = first;
  let bestScore = photonScore(tokens, first);
  let bestCovers = coversQuery(tokens, best);
  for (const hit of hits.slice(1)) {
    const score = photonScore(tokens, hit);
    const covers = coversQuery(tokens, hit);
    const cityBeatsStreet = score === bestScore && score > 0 && isSettlement(hit) && !isSettlement(best);
    const sameKind = covers === bestCovers;
    if ((covers && !bestCovers) || (sameKind && (score > bestScore || cityBeatsStreet))) {
      best = hit;
      bestScore = score;
      bestCovers = covers;
    }
  }
  return { lat: best.lat, lon: best.lon, label: photonLabel(best) };
}

/** Egypt only, so a name like المعادي cannot resolve abroad. minLon,minLat,maxLon,maxLat. */
const EGYPT_BBOX = '24.7,22,36.9,31.7';

/** Photon rejects lang=ar (400). Arabic queries still match with default. */
export function photonSearchUrl(query: string, lang: 'en' | 'ar'): string {
  return `https://photon.komoot.io/api/?${new URLSearchParams({
    q: query.trim(),
    limit: '8',
    lang: lang === 'en' ? 'en' : 'default',
    bbox: EGYPT_BBOX,
  })}`;
}

export async function geocodePlace(
  query: string,
  lang: 'en' | 'ar' = 'en',
): Promise<GeocodedPlace | null> {
  const q = shortenPlaceQuery(query);
  if (!q) {
    return null;
  }
  return pickPhotonPlace(await fetchJson(photonSearchUrl(q, lang)), q);
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

function addressFromOsmTags(tags: Record<string, string>): string | undefined {
  const parts = [
    tags['addr:suburb'],
    tags['addr:neighbourhood'],
    tags['addr:city'],
    tags['addr:state'],
    tags['addr:province'],
  ].filter((p) => p && String(p).trim());
  const uniq = [...new Set(parts.map((p) => String(p).trim()))];
  return uniq.length ? uniq.join(' · ') : undefined;
}

function connectorsFromOsmTags(tags: Record<string, string>): NearbyConnector[] | undefined {
  const out: NearbyConnector[] = [];
  const push = (type: string, countRaw?: string) => {
    const count = countRaw ? Number(countRaw) : undefined;
    out.push({
      type,
      count: Number.isFinite(count) ? count : undefined,
      speed: 'medium',
    });
  };
  if (tags['socket:type2'] === 'yes' || tags['socket:type2']) {
    push('Type 2', tags['socket:type2'] !== 'yes' ? tags['socket:type2'] : undefined);
  }
  if (tags['socket:ccs'] === 'yes' || tags['socket:ccs'] || tags['socket:type2_combo'] === 'yes') {
    push('CCS', tags['socket:ccs'] !== 'yes' ? tags['socket:ccs'] : undefined);
  }
  if (tags['socket:chademo'] === 'yes' || tags['socket:chademo']) {
    push(
      'CHAdeMO',
      tags['socket:chademo'] !== 'yes' ? tags['socket:chademo'] : undefined,
    );
  }
  if (!out.length && tags['capacity']) {
    const n = Number(tags['capacity']);
    if (Number.isFinite(n) && n > 0) {
      out.push({ type: 'EV', count: n, speed: 'medium' });
    }
  }
  return out.length ? out : undefined;
}

export function parseNearbyPoi(
  raw: unknown,
  origin: Coords,
  now: Date = new Date(),
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
      tags['name'] ||
      tags['brand'] ||
      tags['operator'] ||
      (kind === 'fuel' ? 'Gas station' : 'Charger');
    const openingHours = tags['opening_hours']?.trim() || undefined;
    const connectors =
      kind === 'charge' ? connectorsFromOsmTags(tags) : undefined;
    const detail =
      kind === 'fuel'
        ? [tags['fuel:diesel'] === 'yes' ? 'diesel' : '', tags['fuel:octane_95'] === 'yes' ? '95' : '']
            .filter(Boolean)
            .join(' · ') || undefined
        : connectors?.[0]?.type;
    list.push({
      id: Number(e['id']),
      kind,
      name,
      lat,
      lon,
      distanceKm: haversineKm(origin, { lat, lon }),
      brand: tags['brand'] || tags['operator'],
      detail,
      addressLine: addressFromOsmTags(tags),
      openingHours,
      openNow: isOpenNow(openingHours, now),
      connectors,
    });
  }
  return list.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20);
}

export async function nearbyPoi(
  origin: Coords,
  preferKind?: 'fuel' | 'charge',
): Promise<NearbyPoi[]> {
  let last: NearbyPoi[] = [];
  for (const radiusM of NEARBY_RADII_M) {
    const got = await fetchNearbyAt(origin, radiusM);
    if (got == null) {
      continue;
    }
    last = got;
    const hit = preferKind
      ? last.filter((p) => p.kind === preferKind)
      : last;
    if (hit.length) {
      return last;
    }
  }
  return last;
}

/** Around page: one user radius. Fetch fail throws; empty JSON is []. */
export async function nearbyAround(
  origin: Coords,
  radiusKm = 15,
): Promise<NearbyPoi[]> {
  const km = Number.isFinite(radiusKm)
    ? Math.min(300, Math.max(1, Math.round(radiusKm)))
    : 15;
  const first = await fetchAroundAt(origin, km);
  if (first == null) {
    throw new Error('nearby-unavailable');
  }
  if (first.length || km >= 300) {
    return first;
  }
  const retryKm = Math.min(300, km * 2);
  if (retryKm === km) {
    return first;
  }
  const retry = await fetchAroundAt(origin, retryKm);
  return retry ?? first;
}

async function fetchAroundAt(
  origin: Coords,
  radiusKm: number,
): Promise<NearbyPoi[] | null> {
  return fetchNearbyAt(origin, radiusKm * 1000);
}

function overpassAroundQuery(
  origin: Coords,
  radiusM: number,
  element: 'node' | 'way',
): string {
  const around = `(around:${radiusM},${origin.lat},${origin.lon})`;
  return `[out:json][timeout:20];(
${element}["amenity"="fuel"]${around};
${element}["shop"="fuel"]${around};
${element}["amenity"="charging_station"]${around};
);out tags center;`;
}

async function fetchOverpass(query: string): Promise<unknown | null> {
  const body = `data=${encodeURIComponent(query)}`;
  for (const url of OVERPASS_ENDPOINTS) {
    const raw = await fetchJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      12_000,
    );
    if (raw != null) {
      return raw;
    }
  }
  return null;
}

function overpassElements(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const elements = (raw as { elements?: unknown }).elements;
  return Array.isArray(elements) ? elements : [];
}

async function fetchNearbyAt(
  origin: Coords,
  radiusM: number,
): Promise<NearbyPoi[] | null> {
  // Nodes first. A combined node+way query is what the public servers drop.
  const nodes = await fetchOverpass(overpassAroundQuery(origin, radiusM, 'node'));
  if (nodes == null) {
    return null;
  }
  const fromNodes = parseNearbyPoi(nodes, origin);
  if (fromNodes.length) {
    return fromNodes;
  }
  const ways = await fetchOverpass(overpassAroundQuery(origin, radiusM, 'way'));
  if (ways == null) {
    return fromNodes;
  }
  return parseNearbyPoi(
    { elements: [...overpassElements(nodes), ...overpassElements(ways)] },
    origin,
  );
}

const AROUND_CACHE_KEY = 'drivelog.around.v1';

export type AroundCache = {
  lat: number;
  lon: number;
  radiusKm: number;
  items: NearbyPoi[];
  savedAt: number;
  /** Area we understood, when the search was by name. */
  label?: string;
};

export function readAroundCache(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): AroundCache | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(AROUND_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AroundCache;
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) {
      return null;
    }
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAroundCache(
  cache: AroundCache,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage || !cache.items.length) {
    return;
  }
  try {
    storage.setItem(AROUND_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ponytail: private mode can throw; the list on screen still shows
  }
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
