import { describe, expect, it } from 'vitest';
import {
  buildPassportView,
  carPassportToPdf,
  pdfDate,
  pdfNum,
  unitAscii,
} from './car-passport';
import type { Car, Maintenance, VehicleDocument } from './models';

function baseCar(partial: Partial<Car> = {}): Car {
  return {
    id: 'c1',
    nickname: 'Daily',
    initialOdometer: 1000,
    currentOdometer: 5000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('passport PDF number helpers', () => {
  it('keeps ASCII digits and dd/mm/yyyy order', () => {
    expect(pdfDate('2026-09-15')).toBe('15/09/2026');
    expect(pdfNum(49040)).toBe('49,040');
    expect(pdfNum(2041, 2)).toBe('2,041.00');
    expect(unitAscii('ل/١٠٠ كم')).toBe('ل/100 كم');
  });
});

describe('carPassportToPdf Arabic', () => {
  it('builds a PDF blob without throwing', async () => {
    const car: Car = {
      id: 'c1',
      nickname: 'Demo Hatch',
      initialOdometer: 0,
      currentOdometer: 49040,
      year: '2020',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const maintenance: Maintenance[] = [
      {
        id: 'm1',
        type: 'oil',
        date: '2026-09-15',
        odometer: 49040,
        cost: 150,
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z',
      },
    ];
    const blob = await carPassportToPdf(
      { car, fillUps: [], documents: [], maintenance },
      {
        title: 'جواز سفر السيارة',
        generatedPrefix: 'تاريخ الإنشاء',
        vehicle: 'العربية',
        odometer: 'العداد',
        economy: 'الاستهلاك',
        monthSpend: 'مصروف الشهر',
        nextDoc: 'أقرب مستند',
        none: '—',
        km: 'كم',
        lPer100: 'ل/١٠٠ كم',
        currencyLabel: 'ج.م',
        maintenance: 'سجل الصيانة',
        maintEmpty: 'فارغ',
        typeLabel: (t) => t,
      },
      { rtl: true },
    );
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toMatch(/pdf/);
  }, 30_000);
});

describe('buildPassportView', () => {
  const now = new Date(2026, 9, 3);

  it('keeps a nickname and adds make, model, and year underneath', () => {
    const view = buildPassportView(
      {
        car: baseCar({
          make: 'Toyota',
          model: 'Corolla',
          year: '2020',
          plate: ' ABC 123 ',
          tankCapacityLiters: 50,
        }),
        fillUps: [],
        documents: [
          doc('license', '2027-01-01'),
          doc('registration', '2028-02-13'),
        ],
        maintenance: [
          service('m1', 'oil', '2026-01-02'),
          service('m2', 'filter', '2026-06-01'),
        ],
      },
      now,
    );

    expect(view.title).toBe('Daily');
    expect(view.spec).toBe('Toyota Corolla · 2020');
    expect(view.showYear).toBe(false);
    expect(view.plate).toBe('ABC 123');
    expect(view.tankLiters).toBe(50);
    expect(view.drivenKm).toBe(4000);
    expect(view.economy).toBeNull();
    expect(view.monthDeltaPct).toBeNull();
    expect(view.nextDoc?.kind).toBe('license');
    expect(view.docDays).toBe(90);
    expect(view.lastService?.id).toBe('m2');
  });

  it('hides a spec line that only repeats the title and surfaces the year chip', () => {
    const view = buildPassportView({
      car: baseCar({ nickname: '', make: 'Toyota', model: 'Corolla', year: '2020' }),
      fillUps: [],
      documents: [],
      maintenance: [],
    });
    expect(view.title).toBe('Toyota Corolla');
    expect(view.spec).toBe('');
    expect(view.showYear).toBe(true);
  });
});

function doc(kind: VehicleDocument['kind'], expiryDate: string): VehicleDocument {
  return {
    id: kind,
    carId: 'c1',
    kind,
    expiryDate,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function service(id: string, type: Maintenance['type'], date: string): Maintenance {
  return {
    id,
    type,
    date,
    odometer: 2000,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}
