import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AroundResults } from './around-results';
import { I18n } from '../../i18n/i18n';
import type { NearbyPoi } from '../../data/remote';

function poi(partial: Partial<NearbyPoi> & Pick<NearbyPoi, 'name'>): NearbyPoi {
  return {
    id: 1,
    kind: 'fuel',
    lat: 29.05,
    lon: 31.13,
    distanceKm: 7.7,
    ...partial,
  };
}

describe('AroundResults facts', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AroundResults],
      providers: [
        {
          provide: I18n,
          useValue: {
            t: (k: string) => k,
            formatNumber: (n: number) => String(n),
            language: () => 'ar' as const,
            dir: () => 'rtl' as const,
          },
        },
      ],
    }).compileComponents();
  });

  it('drops a latin brand when the station name is already Arabic', () => {
    const fixture = TestBed.createComponent(AroundResults);
    const bits = fixture.componentInstance.facts(
      poi({
        name: 'مصر للبترول',
        brand: 'Misr Petroleum',
        openingHours: '24/7',
        openNow: true,
      }),
    );
    expect(bits.map((bit) => bit.text)).toEqual(['around.openNow', 'around.allDay']);
    expect(bits[0]?.tone).toBe('ok');
  });

  it('stays empty when the map only has a name', () => {
    const fixture = TestBed.createComponent(AroundResults);
    expect(fixture.componentInstance.facts(poi({ name: 'رواد التعاون' }))).toEqual([]);
  });

  it('keeps an Arabic brand and the fuel grades', () => {
    const fixture = TestBed.createComponent(AroundResults);
    const bits = fixture.componentInstance.facts(
      poi({
        name: 'محطة الحي',
        brand: 'التعاون',
        detail: 'diesel · 95',
        addressLine: 'الحي الخامس',
      }),
    );
    expect(bits.map((bit) => bit.text)).toEqual([
      'التعاون',
      'الحي الخامس',
      'fillUp.grade.solar',
      'fillUp.grade.gasoline95',
    ]);
  });
});
