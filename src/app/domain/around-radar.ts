export type LatLon = { lat: number; lon: number };
export type RadarXY = { x: number; y: number };

/** SVG viewBox is 0..100 with the user at the centre. */
export const RADAR_CENTER = 50;
export const RADAR_RADIUS = 46;

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/**
 * North-up placement on the radar. Points past the range sit on the rim.
 * ponytail: flat-earth projection, fine for a few tens of km.
 */
export function radarPoint(origin: LatLon, target: LatLon, rangeKm: number): RadarXY {
  const eastKm = (target.lon - origin.lon) * KM_PER_DEG_LON_EQUATOR * Math.cos((origin.lat * Math.PI) / 180);
  const northKm = (target.lat - origin.lat) * KM_PER_DEG_LAT;
  const km = Math.hypot(eastKm, northKm);
  const scale = km > rangeKm ? rangeKm / km : 1;
  const unit = RADAR_RADIUS / Math.max(rangeKm, 0.1);
  return {
    x: round(RADAR_CENTER + eastKm * scale * unit),
    y: round(RADAR_CENTER - northKm * scale * unit),
  };
}

/** Smallest of 2/5/10/20/50 km that holds the farthest station shown. */
export function radarRangeKm(distancesKm: readonly number[]): number {
  const far = Math.max(0, ...distancesKm);
  return [2, 5, 10, 20, 50].find((km) => far <= km) ?? Math.ceil(far);
}

/**
 * S-shaped road from the centre to a point: leaves and arrives along the longer axis.
 * `mid` is the curve's halfway point, where the time chip sits.
 */
export function radarSnake(to: RadarXY): { d: string; mid: RadarXY } {
  const c = RADAR_CENTER;
  const dx = to.x - c;
  const dy = to.y - c;
  const flat = Math.abs(dx) >= Math.abs(dy);
  const p1 = flat ? { x: round(c + dx * 0.7), y: c } : { x: c, y: round(c + dy * 0.7) };
  const p2 = flat ? { x: round(to.x - dx * 0.7), y: to.y } : { x: to.x, y: round(to.y - dy * 0.7) };
  return {
    d: `M${c} ${c} C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${to.x} ${to.y}`,
    mid: { x: round((c + 3 * p1.x + 3 * p2.x + to.x) / 8), y: round((c + 3 * p1.y + 3 * p2.y + to.y) / 8) },
  };
}

/** Road ≈ 1.3× straight line at ~30 km/h city speed. Shown as approximate. */
export function approxDriveMinutes(distanceKm: number): number {
  return Math.max(1, Math.round(((distanceKm * 1.3) / 30) * 60));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
