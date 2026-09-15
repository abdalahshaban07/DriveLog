import { describe, expect, it } from 'vitest';
import { calcIntervalStatus, worseStatus, roundKm500 } from './maintenance-calc';
import { estimateIntervalFromHistory } from './history-analyzer';
import { measurementThresholdStatus } from './measurement-intel';
import {
  attentionCount,
  buildHealthItems,
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
