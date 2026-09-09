import { countryFromCurrency } from './country';
import { suggestMaintenanceDues } from './interval';
import { isValidVin, normalizeVin } from './vin';
import { weatherKind } from './weather';
import type { Maintenance } from './models';
import {
  lastFillUnitPrice,
  parseCountryFuelPrices,
  parseNearbyPoi,
  parseOpenChargeMap,
  parseRecallCount,
  parseVinDecode,
  parseWeather,
} from '../data/remote';
import { isOpenNow } from './opening-hours';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

export function runPhase2SelfCheck(): void {
  assert(normalizeVin(' 1hgcm82633a004352 ') === '1HGCM82633A004352', 'normalizeVin');
  assert(isValidVin('1HGCM82633A004352') === true, 'valid vin');
  assert(isValidVin('1HGCM82634A004352') === false, 'bad check digit');
  assert(isValidVin('SHORT') === false, 'short vin');

  assert(countryFromCurrency('EGP') === 'EG', 'EGP→EG');
  assert(countryFromCurrency('SAR') === 'SA', 'SAR→SA');
  assert(countryFromCurrency('AED') === 'AE', 'AED→AE');
  assert(countryFromCurrency('XYZ') === 'EG', 'unknown→EG');

  assert(weatherKind(0) === 'clear', 'wmo clear');
  assert(weatherKind(61) === 'rain', 'wmo rain');
  assert(weatherKind(71) === 'snow', 'wmo snow');
  assert(weatherKind(45) === 'other', 'wmo other');

  assert(lastFillUnitPrice(50, 1000) === 20, 'unit price');
  assert(lastFillUnitPrice(0, 100) === null, 'unit price zero liters');

  const decoded = parseVinDecode(
    {
      Results: [
        {
          ModelYear: '2015',
          Make: 'TOYOTA',
          Model: 'COROLLA',
        },
      ],
    },
    'JTDBR32E520012345',
  );
  assert(decoded?.make === 'TOYOTA' && decoded.year === '2015', 'vin parse');

  assert(parseRecallCount({ count: 3, results: [{}, {}, {}] }) === 3, 'recall count');
  assert(parseRecallCount({ results: [{}, {}] }) === 2, 'recall results length');

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

  // Public API shape for EG: diesel + gasoline + premium (no solar / octane keys).
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

  const pois = parseNearbyPoi(
    {
      elements: [
        {
          id: 1,
          lat: 30.05,
          lon: 31.24,
          tags: {
            amenity: 'fuel',
            name: 'Shell',
            brand: 'Shell',
            opening_hours: '24/7',
            'addr:city': 'Cairo',
          },
        },
        {
          id: 2,
          lat: 30.06,
          lon: 31.25,
          tags: {
            amenity: 'charging_station',
            name: 'EV Hub',
            'socket:ccs': 'yes',
            'socket:type2': 'yes',
          },
        },
        {
          id: 3,
          type: 'way',
          center: { lat: 30.045, lon: 31.235 },
          tags: { amenity: 'fuel', name: 'Total', brand: 'Total' },
        },
      ],
    },
    { lat: 30.04, lon: 31.23 },
  );
  assert(pois.length === 3 && pois.some((p) => p.id === 3), 'overpass way center');
  assert(pois[0]!.kind === 'fuel', 'overpass poi');
  const shell = pois.find((p) => p.id === 1);
  assert(shell?.openNow === true && shell.addressLine === 'Cairo', 'overpass open/addr');
  const ev = pois.find((p) => p.id === 2);
  assert(
    ev?.connectors?.some((c) => c.type === 'CCS') &&
      ev.connectors?.some((c) => c.type === 'Type 2'),
    'overpass sockets',
  );

  assert(isOpenNow('24/7') === true, 'opening 24/7');
  assert(isOpenNow('Mo-Fr 08:00-12:00,13:00-18:00') === null, 'opening complex');

  const ocm = parseOpenChargeMap(
    [
      {
        ID: 99,
        AddressInfo: {
          Title: 'Infinity Charge',
          Latitude: 30.05,
          Longitude: 31.24,
          Town: 'Cairo',
          StateOrProvince: 'Cairo Governorate',
        },
        OperatorInfo: { Title: 'Infinity' },
        StatusType: { IsOperational: true },
        Connections: [
          {
            ConnectionType: { Title: 'CCS2' },
            PowerKW: 60,
            Quantity: 2,
          },
        ],
      },
      {
        ID: 100,
        AddressInfo: {
          Title: 'Offline Charge',
          Latitude: 30.06,
          Longitude: 31.25,
        },
        StatusType: { IsOperational: false },
        Connections: [],
      },
    ],
    { lat: 30.04, lon: 31.23 },
  );
  assert(ocm.length === 2 && ocm[0]!.kind === 'charge', 'ocm parse');
  assert(ocm[0]!.connectors?.[0]?.type === 'CCS2', 'ocm connector');
  assert(ocm[0]!.connectors?.[0]?.speed === 'fast', 'ocm fast');
  assert(ocm[0]!.source === 'ocm', 'ocm source');
  assert(ocm[0]!.openNow === true, 'ocm operational open');
  assert(ocm.find((p) => p.id === 100)?.openNow === false, 'ocm offline closed');

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
