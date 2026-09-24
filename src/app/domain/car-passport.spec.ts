import { describe, expect, it } from 'vitest';
import {
  carPassportToPdf,
  pdfDate,
  pdfNum,
  unitAscii,
} from './car-passport';
import type { Car, Maintenance } from './models';

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
