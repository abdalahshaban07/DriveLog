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

/** Quadratic bend from the centre to a point, so the route reads as a road, not a ruler line. */
export function radarCurve(to: RadarXY): string {
  const dx = to.x - RADAR_CENTER;
  const dy = to.y - RADAR_CENTER;
  const bend = 0.22;
  const cx = round(RADAR_CENTER + dx / 2 - dy * bend);
  const cy = round(RADAR_CENTER + dy / 2 + dx * bend);
  return `M${RADAR_CENTER} ${RADAR_CENTER} Q${cx} ${cy} ${to.x} ${to.y}`;
}

/** Road ≈ 1.3× straight line at ~30 km/h city speed. Shown as approximate. */
export function approxDriveMinutes(distanceKm: number): number {
  return Math.max(1, Math.round(((distanceKm * 1.3) / 30) * 60));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
