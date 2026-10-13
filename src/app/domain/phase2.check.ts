import { countryFromCurrency } from './country';
import { suggestMaintenanceDues } from './interval';
import { weatherKind } from './weather';
import type { Maintenance } from './models';
import { parseCountryFuelPrices, parseWeather, stationsNear } from '../data/remote';
import { isOpenNow } from './opening-hours';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

export function runPhase2SelfCheck(): void {
  assert(countryFromCurrency('EGP') === 'EG', 'EGP→EG');
  assert(countryFromCurrency('SAR') === 'SA', 'SAR→SA');
  assert(countryFromCurrency('AED') === 'AE', 'AED→AE');
  assert(countryFromCurrency('XYZ') === 'EG', 'unknown→EG');

  assert(weatherKind(0) === 'clear', 'wmo clear');
  assert(weatherKind(61) === 'rain', 'wmo rain');
  assert(weatherKind(71) === 'snow', 'wmo snow');
  assert(weatherKind(45) === 'other', 'wmo other');

  const wx = parseWeather(
    { current: { temperature_2m: 32.5, weather_code: 0 } },
    30.04,
    31.23,
  );
  assert(wx?.tempC === 32.5 && wx.weatherCode === 0, 'weather parse');

  const prices = parseCountryFuelPrices(
    {
      data: {
        EG: {
          country_code: 'EG',
          country_name: 'Egypt',
          local_currency: 'EGP',
          prices: {
            solar: 20.5,
            diesel: 20.5,
            gasoline_92: 22.25,
            gasoline_95: 24.0,
            gasoline: 22.25,
          },
        },
      },
    },
    'EG',
  );
  assert(prices?.solar === 20.5 && prices.diesel === 20.5, 'openvan solar/diesel');
  assert(prices?.gasoline92 === 22.25 && prices.gasoline95 === 24, 'openvan 92/95');
  assert(prices?.gasoline === 22.25, 'openvan gasoline alias');

  const egApi = parseCountryFuelPrices(
    {
      data: {
        EG: {
          country_code: 'EG',
          country_name: 'Egypt',
          local_currency: 'EGP',
          prices: { diesel: 15.75, gasoline: 19.0, premium: 21.0 },
        },
      },
    },
    'EG',
  );
  assert(egApi?.solar === 15.75 && egApi.diesel == null, 'EG diesel→solar');
  assert(egApi?.gasoline92 === 19 && egApi.gasoline95 === 21, 'EG gasoline/premium');

  const pois = stationsNear(
    {
      updated: '2026-10-01',
      fuel: [
        [30.05, 31.24, 'Shell Tahrir', 'Shell'],
        [30.6, 31.6, 'Far away', null],
      ],
      charge: [[30.045, 31.235, '', 'Infinity EV', 60]],
    },
    { lat: 30.04, lon: 31.23 },
    15,
  );
  assert(pois.length === 2 && pois[0]!.kind === 'charge', 'stations near, nearest first');
  assert(pois[0]!.name === 'Infinity EV' && pois[0]!.detail === '60 kW', 'charger network + kW');
  assert(pois[1]!.brand === 'Shell', 'fuel brand');

  assert(isOpenNow('24/7') === true, 'opening 24/7');
  assert(isOpenNow('Mo-Fr 08:00-12:00,13:00-18:00') === null, 'opening complex');

  const maint: Maintenance[] = [
    {
      id: '1',
      type: 'oil',
      odometer: 10000,
      cost: 500,
      date: '2025-01-01',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: '2',
      type: 'oil',
      odometer: 15000,
      cost: 500,
      date: '2025-06-01',
      createdAt: '2025-06-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
    },
  ];
  const sug = suggestMaintenanceDues(maint, 19600);
  assert(sug.length === 1 && sug[0]!.dueKm === 20000, 'interval suggest');
  assert(sug[0]!.status === 'dueSoon', 'interval dueSoon');
  assert(suggestMaintenanceDues(maint, 21000)[0]!.status === 'overdue', 'interval overdue');

  const withDue: Maintenance[] = [
    { ...maint[0]!, dueKm: 16000 },
    { ...maint[1]!, dueKm: 21000 },
  ];
  assert(suggestMaintenanceDues(withDue, 19000).length === 0, 'skip explicit dues');
}
