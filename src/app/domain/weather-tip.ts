import { weatherKind, type WeatherKind } from './weather';

export type WeatherTipKey =
  | 'home.weather.tip.rain'
  | 'home.weather.tip.snow'
  | 'home.weather.tip.heat'
  | 'home.weather.tip.cold'
  | 'home.weather.tip.clear'
  | 'home.weather.tip.other';

const HEAT_C = 35;
const COLD_C = 5;

/** Map live Open-Meteo sample to one driving tip key. Heat/cold beat clear. */
export function weatherTipKey(tempC: number, weatherCode: number): WeatherTipKey {
  const kind: WeatherKind = weatherKind(weatherCode);
  switch (kind) {
    case 'rain':
      return 'home.weather.tip.rain';
    case 'snow':
      return 'home.weather.tip.snow';
    case 'clear':
    case 'other':
      if (Number.isFinite(tempC) && tempC >= HEAT_C) {
        return 'home.weather.tip.heat';
      }
      if (Number.isFinite(tempC) && tempC <= COLD_C) {
        return 'home.weather.tip.cold';
      }
      return kind === 'clear' ? 'home.weather.tip.clear' : 'home.weather.tip.other';
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
