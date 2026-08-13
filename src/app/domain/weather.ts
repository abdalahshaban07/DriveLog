export type WeatherKind = 'clear' | 'rain' | 'snow' | 'other';

/** Map WMO weather codes to a coarse label key. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0 || code === 1 || code === 2 || code === 3) {
    return 'clear';
  }
  if (
    code === 51 ||
    code === 53 ||
    code === 55 ||
    code === 56 ||
    code === 57 ||
    code === 61 ||
    code === 63 ||
    code === 65 ||
    code === 66 ||
    code === 67 ||
    code === 80 ||
    code === 81 ||
    code === 82 ||
    code === 95 ||
    code === 96 ||
    code === 99
  ) {
    return 'rain';
  }
  if (
    code === 71 ||
    code === 73 ||
    code === 75 ||
    code === 77 ||
    code === 85 ||
    code === 86
  ) {
    return 'snow';
  }
  return 'other';
}

export function weatherMsgKey(code: number): `weather.${WeatherKind}` {
  return `weather.${weatherKind(code)}`;
}
