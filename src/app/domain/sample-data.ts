import type { Car, FillUp, Maintenance } from './models';

export const SAMPLE_CAR_ID = 'sample-car';

/** Deterministic demo dataset for first-run explore mode. */
export function buildSampleDataset(now = new Date()): {
  car: Car;
  fillUps: FillUp[];
  maintenance: Maintenance[];
} {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const car: Car = {
    id: SAMPLE_CAR_ID,
    nickname: 'Demo Hatch',
    initialOdometer: 42000,
    currentOdometer: 45540,
    tankCapacityLiters: 45,
    createdAt: `${day(year, month - 5, 1)}T08:00:00.000Z`,
    updatedAt: `${day(year, month, 1)}T08:00:00.000Z`,
  };

  const fills: Omit<FillUp, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { odometer: 42240, liters: 38, cost: 532, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month - 5, 4), placeLabel: 'Shell Downtown', distanceKm: 240 },
    { odometer: 42510, liters: 36, cost: 504, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month - 5, 18), placeLabel: 'Total Midtown', distanceKm: 270 },
    { odometer: 42780, liters: 40, cost: 600, tankFull: true, fuelGrade: 'gasoline95', unitPrice: 15, date: day(year, month - 4, 2), placeLabel: 'BP Ring Road', distanceKm: 270 },
    { odometer: 43040, liters: 35, cost: 490, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month - 4, 16), placeLabel: 'Shell Downtown', distanceKm: 260 },
    { odometer: 43300, liters: 37, cost: 555, tankFull: true, fuelGrade: 'gasoline95', unitPrice: 15, date: day(year, month - 3, 1), placeLabel: 'Mobil East', distanceKm: 260 },
    { odometer: 43560, liters: 34, cost: 476, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month - 3, 15), placeLabel: 'Total Midtown', distanceKm: 260 },
    { odometer: 43820, liters: 39, cost: 585, tankFull: true, fuelGrade: 'gasoline95', unitPrice: 15, date: day(year, month - 2, 2), placeLabel: 'Shell Downtown', distanceKm: 260 },
    { odometer: 44080, liters: 36, cost: 504, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month - 2, 16), placeLabel: 'BP Ring Road', distanceKm: 260 },
    { odometer: 44340, liters: 38, cost: 570, tankFull: true, fuelGrade: 'gasoline95', unitPrice: 15, date: day(year, month - 1, 1), placeLabel: 'Mobil East', distanceKm: 260 },
    { odometer: 44590, liters: 33, cost: 462, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month - 1, 14), placeLabel: 'Shell Downtown', distanceKm: 250 },
    { odometer: 44840, liters: 35, cost: 525, tankFull: true, fuelGrade: 'gasoline95', unitPrice: 15, date: day(year, month - 1, 28), placeLabel: 'Total Midtown', distanceKm: 250 },
    { odometer: 45060, liters: 32, cost: 448, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month, 8), placeLabel: 'BP Ring Road', distanceKm: 220 },
    { odometer: 45300, liters: 34, cost: 510, tankFull: true, fuelGrade: 'gasoline95', unitPrice: 15, date: day(year, month, 18), placeLabel: 'Shell Downtown', distanceKm: 240 },
    { odometer: 45540, liters: 33, cost: 462, tankFull: true, fuelGrade: 'gasoline92', unitPrice: 14, date: day(year, month, 26), placeLabel: 'Mobil East', distanceKm: 240 },
  ];

  const fillUps: FillUp[] = fills.map((f, i) => ({
    ...f,
    id: `sample-fill-${i + 1}`,
    carId: SAMPLE_CAR_ID,
    createdAt: `${f.date}T10:00:00.000Z`,
    updatedAt: `${f.date}T10:00:00.000Z`,
  }));

  const maintenance: Maintenance[] = [
    {
      id: 'sample-maint-1',
      carId: SAMPLE_CAR_ID,
      type: 'oil',
      odometer: 42500,
      cost: 850,
      date: day(year, month - 4, 20),
      dueKm: 45500,
      createdAt: `${day(year, month - 4, 20)}T12:00:00.000Z`,
      updatedAt: `${day(year, month - 4, 20)}T12:00:00.000Z`,
    },
    {
      id: 'sample-maint-2',
      carId: SAMPLE_CAR_ID,
      type: 'tires',
      odometer: 43800,
      cost: 2200,
      date: day(year, month - 2, 5),
      createdAt: `${day(year, month - 2, 5)}T12:00:00.000Z`,
      updatedAt: `${day(year, month - 2, 5)}T12:00:00.000Z`,
    },
    {
      id: 'sample-maint-3',
      carId: SAMPLE_CAR_ID,
      type: 'brakes',
      odometer: 44900,
      cost: 1400,
      date: day(year, month - 1, 10),
      dueDate: day(year, month + 1, 10),
      createdAt: `${day(year, month - 1, 10)}T12:00:00.000Z`,
      updatedAt: `${day(year, month - 1, 10)}T12:00:00.000Z`,
    },
  ];

  return { car, fillUps, maintenance };
}
