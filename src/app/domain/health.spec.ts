import { describe, expect, it } from 'vitest';
import { ar } from '../i18n/ar';
import { en } from '../i18n/en';
import { detectAdvisorIntent } from './advisor-intent';
import { calcIntervalStatus, worseStatus, roundKm500 } from './maintenance-calc';
import { estimateIntervalFromHistory } from './history-analyzer';
import { measurementThresholdStatus } from './measurement-intel';
import {
  attentionCount,
  buildHealthItems,
  healthFactLine,
  healthScore,
  joinHealthNames,
  lifeRemainingPct,
  packHealthInsight,
  sectionForStatus,
} from './vehicle-health';
import {
  ROUTINE_CHECK_PART_ID,
  SYSTEM_BRAKE_PADS_ID,
  SYSTEM_ENGINE_OIL_ID,
  SYSTEM_PART_CATALOG,
  systemPartById,
} from './part-catalog';
import type { Maintenance, PartDefinition, PartOverride, Settings } from './models';

const settings: Settings = {
  language: 'en',
  theme: 'system',
  look: 'receipt',
  currency: 'EGP',
  unitSystem: 'metric',
  installBannerDismissed: false,
  remindersEnabled: true,
  soonThresholdRatio: 0.2,
};

function part(id: string, extras: Partial<PartDefinition> = {}): PartDefinition {
  const base = systemPartById(id) ?? SYSTEM_PART_CATALOG[0]!;
  return { ...base, ...extras, id };
}

describe('maintenance-calc', () => {
  it('marks exact due km as due and beyond as overdue', () => {
    const due = calcIntervalStatus({
      currentOdometer: 50_000,
      today: '2026-09-15',
      km: { lastKm: 40_000, intervalKm: 10_000, source: 'SYSTEM_RULE' },
    });
    expect(due.status).toBe('due');
    expect(due.remainingKm).toBe(0);

    const overdue = calcIntervalStatus({
      currentOdometer: 50_001,
      today: '2026-09-15',
      km: { lastKm: 40_000, intervalKm: 10_000, source: 'SYSTEM_RULE' },
    });
    expect(overdue.status).toBe('overdue');
  });

  it('SOON when either dimension ratio is within threshold', () => {
    const r = calcIntervalStatus({
      currentOdometer: 49_000,
      today: '2026-09-15',
      km: { lastKm: 40_000, intervalKm: 10_000, source: 'SYSTEM_RULE' },
      soonRatio: 0.2,
    });
    expect(r.status).toBe('soon');
  });

  it('worseStatus prefers critical', () => {
    expect(worseStatus('good', 'critical')).toBe('critical');
    expect(worseStatus('soon', 'due')).toBe('due');
  });

  it('rounds wear distance to nearest 500 km', () => {
    expect(roundKm500(1234)).toBe(1000);
    expect(roundKm500(1750)).toBe(2000);
  });
});

describe('history-analyzer', () => {
  it('learns oil interval from replacement/service gaps', () => {
    const rows: Maintenance[] = [
      {
        id: '1',
        type: 'oil',
        partDefinitionId: SYSTEM_ENGINE_OIL_ID,
        recordType: 'service',
        odometer: 40_000,
        date: '2025-01-01',
        createdAt: 'a',
        updatedAt: 'a',
      },
      {
        id: '2',
        type: 'oil',
        partDefinitionId: SYSTEM_ENGINE_OIL_ID,
        recordType: 'replacement',
        odometer: 45_000,
        date: '2025-06-01',
        createdAt: 'b',
        updatedAt: 'b',
      },
      {
        id: '3',
        type: 'oil',
        partDefinitionId: SYSTEM_ENGINE_OIL_ID,
        recordType: 'service',
        odometer: 50_000,
        date: '2025-12-01',
        createdAt: 'c',
        updatedAt: 'c',
      },
    ];
    const est = estimateIntervalFromHistory(rows, SYSTEM_ENGINE_OIL_ID);
    expect(est?.intervalKm).toBe(5000);
    expect(est?.confidence).toBe('medium');
  });
});

describe('measurement-intel', () => {
  it('returns null without user threshold', () => {
    expect(
      measurementThresholdStatus(3, {
        type: 'brakePadMm',
        unit: 'mm',
        direction: 'lower-is-worse',
      }),
    ).toBeNull();
  });

  it('applies user lower-is-worse brake threshold', () => {
    const status = measurementThresholdStatus(2, {
      type: 'brakePadMm',
      unit: 'mm',
      direction: 'lower-is-worse',
      attentionValue: 4,
      criticalValue: 2,
    });
    expect(status).toBe('critical');
  });
});

describe('vehicle-health', () => {
  it('always includes routine check and maps oil separately', () => {
    const car = {
      id: 'c1',
      nickname: 'T',
      initialOdometer: 40_000,
      currentOdometer: 49_500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const oil = part(SYSTEM_ENGINE_OIL_ID, {
      trackingMode: 'interval',
      userIntervalKm: 5000,
    });
    const overrides: PartOverride[] = [
      {
        id: 'c1:oil',
        carId: 'c1',
        partDefinitionId: SYSTEM_ENGINE_OIL_ID,
        active: true,
        updatedAt: 'x',
      },
    ];
    const maint: Maintenance[] = [
      {
        id: 'm1',
        carId: 'c1',
        type: 'oil',
        partDefinitionId: SYSTEM_ENGINE_OIL_ID,
        recordType: 'service',
        odometer: 45_000,
        date: '2026-01-01',
        createdAt: 'a',
        updatedAt: 'a',
      },
    ];
    const items = buildHealthItems({
      car,
      settings,
      customParts: [oil, part(SYSTEM_BRAKE_PADS_ID)],
      overrides,
      maintenance: maint,
      today: '2026-09-15',
    });
    expect(items.some((i) => i.partDefinitionId === ROUTINE_CHECK_PART_ID)).toBe(true);
    const oilItem = items.find((i) => i.partDefinitionId === SYSTEM_ENGINE_OIL_ID);
    expect(oilItem).toBeTruthy();
    expect(sectionForStatus(oilItem!.status)).toMatch(/attention|upcoming|healthy|tracking/);
    expect(attentionCount(items)).toBeGreaterThanOrEqual(0);
  });

  it('keeps custom history parts unknown until interval exists', () => {
    const car = {
      id: 'c1',
      nickname: 'T',
      initialOdometer: 10_000,
      currentOdometer: 12_000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const custom: PartDefinition = {
      id: 'custom-1',
      carId: 'c1',
      name: 'Cabin polish',
      category: 'OTHER',
      source: 'custom',
      trackingMode: 'history',
      active: true,
      createdAt: 'a',
      updatedAt: 'a',
    };
    const items = buildHealthItems({
      car,
      settings,
      customParts: [custom],
      overrides: [
        {
          id: 'c1:custom-1',
          carId: 'c1',
          partDefinitionId: 'custom-1',
          active: true,
          updatedAt: 'x',
        },
      ],
      maintenance: [
        {
          id: 'm1',
          carId: 'c1',
          type: 'other',
          partDefinitionId: 'custom-1',
          recordType: 'service',
          odometer: 11_000,
          date: '2026-01-01',
          createdAt: 'a',
          updatedAt: 'a',
        },
      ],
      today: '2026-09-15',
    });
    const c = items.find((i) => i.partDefinitionId === 'custom-1');
    expect(c?.status).toBe('unknown');
  });
});

describe('health presentation', () => {
  it('scores a mix of statuses and clamps remaining life', () => {
    expect(healthScore([])).toBeNull();
    expect(healthScore(['good', 'good'])).toBe(100);
    expect(healthScore(['good', 'due'])).toBe(58);
    expect(healthScore(['critical'])).toBe(0);

    expect(lifeRemainingPct({ remainingKm: 280, part: { intervalKm: 1_000 } })).toBe(28);
    expect(
      lifeRemainingPct({
        remainingKm: 280,
        dueKm: 11_000,
        lastServiceOdo: 10_000,
        part: { intervalKm: 10_000 },
      }),
    ).toBe(28);
    expect(lifeRemainingPct({ remainingKm: -40, part: { intervalKm: 1_000 } })).toBe(0);
    expect(lifeRemainingPct({ remainingKm: 100, part: {} })).toBeNull();
  });

  it('packs urgent status and remaining distance, else the next fact', () => {
    const labels = { urgentLabel: 'مستعجل', nextLabel: 'بعده', noneLabel: 'مفيش' };
    expect(healthFactLine({ name: 'فلتر التكييف', status: 'مستحق', remain: '0 كم' })).toBe(
      'فلتر التكييف — مستحق — 0 كم',
    );
    expect(healthFactLine({ name: 'البطارية', status: 'مش معروف', remain: '' })).toBe(
      'البطارية — مش معروف',
    );
    const packed = packHealthInsight({
      attention: [
        { name: 'فلتر التكييف', status: 'مستحق', remain: '0 كم' },
        { name: 'زيت المحرك', status: 'متأخر', remain: '200 كم' },
        { name: ' ', status: 'مستحق', remain: '1 كم' },
      ],
      upcoming: [{ name: 'البطارية', status: 'قريب', remain: '2 شهر' }],
      watch: { name: 'مياه الردياتير', status: 'كويس', remain: '3000 كم' },
      total: 4,
      ...labels,
    });
    expect(packed.kind).toBe('attention');
    if (packed.kind !== 'attention') return;
    expect(packed.urgent).toEqual([
      'فلتر التكييف — مستحق — 0 كم',
      'زيت المحرك — متأخر — 200 كم',
    ]);
    expect(packed.next).toBe('البطارية — قريب — 2 شهر');
    expect(packed.facts).toBe(
      [
        'مستعجل',
        '- فلتر التكييف — مستحق — 0 كم',
        '- زيت المحرك — متأخر — 200 كم',
        'بعده',
        '- البطارية — قريب — 2 شهر',
      ].join('\n'),
    );
    expect(packed.facts).not.toMatch(/VIN|اولوي|priorit/i);
    expect(`${en['health.insight.prompt']}\n${en['health.insight.system']}`).not.toMatch(
      /priorit|VIN/i,
    );
    expect(`${ar['health.insight.prompt']}\n${ar['health.insight.system']}`).not.toMatch(/اولوي|VIN/);
    expect(detectAdvisorIntent(en['health.insight.prompt'])).toBe('UNSUPPORTED');
    expect(detectAdvisorIntent(ar['health.insight.prompt'])).toBe('UNSUPPORTED');

    const nextOnly = packHealthInsight({
      attention: [],
      upcoming: [],
      watch: { name: 'فلتر التكييف', status: 'كويس', remain: '3168 كم' },
      total: 2,
      urgentLabel: 'Urgent',
      nextLabel: 'Later',
      noneLabel: 'none',
    });
    expect(nextOnly).toMatchObject({
      kind: 'next',
      next: 'فلتر التكييف — كويس — 3168 كم',
      lines: ['فلتر التكييف — كويس — 3168 كم'],
    });
    const withAlso = packHealthInsight({
      attention: [],
      upcoming: [],
      watch: { name: 'فلتر التكييف', status: 'كويس', remain: '3168 كم' },
      also: [{ name: 'زيت المحرك', status: 'كويس', remain: '8000 كم' }],
      total: 2,
      urgentLabel: 'Urgent',
      nextLabel: 'Later',
      noneLabel: 'none',
    });
    expect(withAlso.kind).toBe('next');
    if (withAlso.kind === 'next') {
      expect(withAlso.lines).toEqual([
        'فلتر التكييف — كويس — 3168 كم',
        'زيت المحرك — كويس — 8000 كم',
      ]);
      expect(withAlso.facts).toContain('زيت المحرك — كويس — 8000 كم');
    }
    expect(packHealthInsight({ attention: [], upcoming: [], watch: null, total: 1, ...labels }).kind).toBe(
      'quiet',
    );
    expect(packHealthInsight({ attention: [], upcoming: [], watch: null, total: 0, ...labels }).kind).toBe(
      'empty',
    );
    expect(joinHealthNames(['زيت', 'فلتر'], 'ar')).toBe('زيت وفلتر');
  });
});
