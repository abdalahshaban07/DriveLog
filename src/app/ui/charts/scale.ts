/** Round to a "nice" step (1, 2, 5, 10 × 10^n). */
function niceStep(raw: number, round: boolean): number {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  let nf: number;
  if (round) {
    if (f < 1.5) {
      nf = 1;
    } else if (f < 3) {
      nf = 2;
    } else if (f < 7) {
      nf = 5;
    } else {
      nf = 10;
    }
  } else if (f <= 1) {
    nf = 1;
  } else if (f <= 2) {
    nf = 2;
  } else if (f <= 5) {
    nf = 5;
  } else {
    nf = 10;
  }
  return nf * 10 ** exp;
}

/** Human-friendly tick values for a numeric domain. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  if (min === max) {
    return min === 0 ? [0] : [min];
  }
  if (min > max) {
    return niceTicks(max, min, count);
  }
  const span = niceStep(max - min, false);
  const step = niceStep(span / Math.max(1, count - 1), true);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step * 0.5; t += step) {
    ticks.push(Math.round(t * 1e12) / 1e12);
  }
  return ticks;
}

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  ticks: () => number[];
}

/** Maps a numeric domain to a pixel range with nice tick helpers. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  tickCount = 5,
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number): number =>
    r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = [d0, d1];
  scale.range = [r0, r1];
  scale.ticks = () => niceTicks(d0, d1, tickCount);
  return scale;
}
