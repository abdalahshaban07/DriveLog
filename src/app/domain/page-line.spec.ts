import { describe, expect, it } from 'vitest';
import { ar } from '../i18n/ar';
import type { Breakdown, DueItem, FillUp, Maintenance } from './models';
import {
  pageLineFact,
  pageLineSentence,
  rewriteKeepsFacts,
  type PageLineBag,
} from './page-line';

function fill(
  partial: Partial<FillUp> & Pick<FillUp, 'id' | 'odometer' | 'liters' | 'cost' | 'tankFull'>,
): FillUp {
  return {
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    distanceKm: 500,
    ...partial,
  };
}

function maint(partial: Partial<Maintenance> & Pick<Maintenance, 'id' | 'type'>): Maintenance {
  return {
    odometer: 1000,
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function due(partial: Partial<DueItem> & Pick<DueItem, 'id' | 'labelKey' | 'status'>): DueItem {
  return { source: 'maintenance', ...partial };
}

function bag(partial: Partial<PageLineBag> = {}): PageLineBag {
  return {
    today: '2026-10-10',
    currency: 'EGP',
    fills: [],
    maintenance: [],
    breakdowns: [],
    dues: [],
    upcoming: [],
    odometer: 0,
    reportFuel: 0,
    reportMaint: 0,
    reportTotal: 0,
    budgetRemaining: null,
    labelDue: (item) => item.labelKey,
    labelMaint: (row) => row.type,
    ...partial,
  };
}

const worseFills = [
  fill({ id: 'a', odometer: 10000, liters: 40, cost: 50, tankFull: true, date: '2026-01-01' }),
  fill({ id: 'b', odometer: 10500, liters: 40, cost: 50, tankFull: true, date: '2026-01-15' }),
  fill({ id: 'c', odometer: 11000, liters: 50, cost: 60, tankFull: true, date: '2026-01-29' }),
];

const flatFills = [
  worseFills[0]!,
  worseFills[1]!,
  fill({ id: 'ok', odometer: 11000, liters: 40, cost: 50, tankFull: true, date: '2026-01-29' }),
];

describe('pageLineFact', () => {
  it('hides home when the log has nothing to say', () => {
    expect(pageLineFact('home', bag())).toBeNull();
  });

  it('keeps a dashboard line when consumption is in the usual range', () => {
    expect(pageLineFact('home', bag({ fills: flatFills }))).toEqual({ id: 'homeFlat' });
  });

  it('combines higher consumption with the next due item', () => {
    const fact = pageLineFact(
      'home',
      bag({
        fills: worseFills,
        dues: [due({ id: 'oil', labelKey: 'maintenance.type.oil', status: 'dueSoon' })],
        labelDue: () => 'الزيت',
      }),
    );
    expect(fact).toEqual({ id: 'homeBoth', label: 'الزيت' });
  });

  it('says consumption on fuel when the latest tank is worse, not a price', () => {
    expect(pageLineFact('fuel', bag({ fills: worseFills }))).toEqual({ id: 'fuelUse' });
    const sentence = pageLineSentence({ id: 'fuelUse' }, 'ar');
    expect(sentence.key).toBe('pageLine.fuelUse');
  });

  it('uses fill cadence when consumption is not worse', () => {
    expect(pageLineFact('fuel', bag({ fills: flatFills, today: '2026-02-08' }))).toEqual({
      id: 'fuelCadence',
      interval: 14,
      days: 10,
    });
    expect(pageLineFact('fuel', bag({ fills: flatFills.slice(0, 1) }))).toBeNull();
  });

  it('keeps the Egypt station line free of a price comparison', () => {
    expect(pageLineFact('around', bag({ currency: 'EGP' }))).toEqual({ id: 'aroundEg' });
    expect(pageLineFact('around', bag({ currency: 'USD' }))).toEqual({ id: 'aroundNear' });
    expect(pageLineSentence({ id: 'aroundEg' }, 'en').key).toBe('pageLine.aroundEg');
    expect(ar['pageLine.aroundEg']).not.toMatch(/أغلى/);
    expect(ar['pageLine.fuelUse']).not.toMatch(/أغلى|سعر/);
  });

  it('pairs two close services and hides a distant pair', () => {
    const close = pageLineFact(
      'maintenance',
      bag({
        maintenance: [
          maint({ id: '1', type: 'oil', dueKm: 10000 }),
          maint({ id: '2', type: 'brakes', dueKm: 11000 }),
        ],
      }),
    );
    expect(close).toEqual({ id: 'maintPair', a: 'oil', b: 'brakes' });
    expect(
      pageLineFact(
        'maintenance',
        bag({
          maintenance: [
            maint({ id: '1', type: 'oil', dueKm: 10000 }),
            maint({ id: '2', type: 'brakes', dueKm: 20000 }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('names a repeated breakdown shop', () => {
    const rows: Breakdown[] = [
      {
        id: '1',
        carId: 'c',
        symptom: 'صوت فرامل',
        repairCost: 10,
        odometer: 1,
        date: '2026-01-01',
        shopName: 'ورشة النور',
        category: 'mechanical',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        carId: 'c',
        symptom: 'صوت فرامل',
        repairCost: 10,
        odometer: 2,
        date: '2026-04-01',
        category: 'mechanical',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ];
    expect(pageLineFact('breakdowns', bag({ breakdowns: rows }))).toEqual({
      id: 'breakdown',
      shop: 'ورشة النور',
    });
    expect(pageLineFact('breakdowns', bag({ breakdowns: rows.slice(0, 1) }))).toBeNull();
  });

  it('says insurance only when it ends before the license', () => {
    expect(
      pageLineFact(
        'vault',
        bag({ insuranceExpiry: '2026-11-01', licenseExpiry: '2027-01-01' }),
      ),
    ).toEqual({ id: 'vault' });
    expect(
      pageLineFact(
        'vault',
        bag({ insuranceExpiry: '2027-06-01', licenseExpiry: '2027-01-01' }),
      ),
    ).toBeNull();
  });

  it('mentions the oil budget only while the cap remains and oil is due', () => {
    const oil = [due({ id: 'oil', labelKey: 'maintenance.type.oil', status: 'dueSoon' })];
    expect(pageLineFact('budget', bag({ budgetRemaining: 200, dues: oil }))).toEqual({
      id: 'budget',
    });
    expect(pageLineFact('budget', bag({ budgetRemaining: 0, dues: oil }))).toBeNull();
    expect(pageLineFact('budget', bag({ budgetRemaining: 200 }))).toBeNull();
  });

  it('counts every due-soon row the coming-up page shows', () => {
    expect(
      pageLineFact(
        'upcoming',
        bag({
          upcoming: [
            { label: 'زيت المحرك', status: 'overdue' },
            { label: 'الفرامل', status: 'dueSoon' },
            { label: 'الرخصة', status: 'dueSoon' },
          ],
        }),
      ),
    ).toEqual({ id: 'upcoming', count: 3, name: 'زيت المحرك' });
  });

  it('pairs an overdue service with a due-soon one even when one is by km', () => {
    expect(
      pageLineFact(
        'maintenance',
        bag({
          odometer: 1000,
          maintenance: [
            maint({ id: '1', type: 'oil', dueKm: 1000 }),
            maint({ id: '2', type: 'brakes', dueDate: '2026-10-20' }),
          ],
        }),
      ),
    ).toEqual({ id: 'maintPair', a: 'oil', b: 'brakes' });
  });

  it('hides passport until a service is at least a month old', () => {
    expect(
      pageLineFact(
        'passport',
        bag({ maintenance: [maint({ id: '1', type: 'oil', date: '2026-06-01' })] }),
      ),
    ).toEqual({ id: 'passport', months: 4 });
    expect(pageLineFact('passport', bag())).toBeNull();
    expect(
      pageLineFact(
        'passport',
        bag({ maintenance: [maint({ id: '1', type: 'oil', date: '2026-09-10' })] }),
      ),
    ).toEqual({ id: 'passportOne' });
  });

  it('credits a month rise to maintenance only when it beats fuel', () => {
    expect(
      pageLineFact(
        'charts',
        bag({
          today: '2026-10-10',
          fills: [
            fill({ id: 'j', odometer: 1, liters: 10, cost: 100, tankFull: true, date: '2026-07-02' }),
            fill({ id: 'a', odometer: 2, liters: 10, cost: 50, tankFull: true, date: '2026-08-02' }),
          ],
          maintenance: [maint({ id: 'm', type: 'brakes', date: '2026-08-15', cost: 400 })],
        }),
      ),
    ).toEqual({ id: 'charts', month: '2026-08' });
  });

  it('names the spend leader only when it clearly leads', () => {
    expect(
      pageLineFact('reports', bag({ reportFuel: 80, reportMaint: 20, reportTotal: 100 })),
    ).toEqual({ id: 'reportsFuel' });
    expect(
      pageLineFact('reports', bag({ reportFuel: 55, reportMaint: 45, reportTotal: 100 })),
    ).toEqual({ id: 'reportsEven' });
    expect(pageLineFact('reports', bag({ reportFuel: 40, reportMaint: 0, reportTotal: 40 }))).toEqual({
      id: 'reportsFuel',
    });
  });
});

describe('rewriteKeepsFacts', () => {
  it('allows the same number in Arabic digits and rejects a new one', () => {
    expect(rewriteKeepsFacts('آخر تعبئة من 12 يوم.', 'آخر تعبئة من ١٢ يوم.')).toBe(true);
    expect(rewriteKeepsFacts('آخر تعبئة من 12 يوم.', 'آخر تعبئة من 3 يوم.')).toBe(false);
  });

  it('rejects a rewrite that drops the original words', () => {
    expect(
      rewriteKeepsFacts(
        'لو الزيت اتأجل، السقف يستحمل.',
        'لو الزيت لم ينفع، الملك إ بط argitar.',
      ),
    ).toBe(false);
    expect(
      rewriteKeepsFacts(
        'زيت المحرك وتيل الفرامل قربوا من بعض، اعملهم في زيارة واحدة.',
        'اجة الزيت وزيت المحرك عقبوها كدا لكن في زيارة واحدة.',
      ),
    ).toBe(false);
  });
});
