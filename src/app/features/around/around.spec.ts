import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AroundPage } from './around';
import { I18n } from '../../i18n/i18n';

describe('AroundPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AroundPage],
      providers: [
        {
          provide: I18n,
          useValue: {
            t: (k: string) => k,
            formatNumber: (n: number) => String(n),
            language: () => 'en' as const,
            dir: () => 'ltr' as const,
          },
        },
      ],
    }).compileComponents();
  });

  it('does not request location until the CTA is used', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.requested()).toBe(false);
    expect(fixture.componentInstance.nearbyLoading()).toBe(false);
    expect(fixture.componentInstance.nearbyItems()).toEqual([]);
    expect(fixture.componentInstance.nearbyError()).toBeNull();
    expect(fixture.componentInstance.rangeKm()).toBe(15);
  });

  it('clamps range and blocks search when invalid', async () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.onRange('0');
    expect(fixture.componentInstance.rangeError()).toBe('around.rangeError');
    await fixture.componentInstance.useMyLocation();
    expect(fixture.componentInstance.requested()).toBe(false);
    fixture.componentInstance.onRange('20');
    expect(fixture.componentInstance.rangeKm()).toBe(20);
    expect(fixture.componentInstance.rangeError()).toBe('');
  });

  it('requests location only after Use my location', async () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    // jsdom has no geolocation → getCoords resolves null (denied/unavailable path)
    await fixture.componentInstance.useMyLocation();
    expect(fixture.componentInstance.requested()).toBe(true);
    expect(fixture.componentInstance.nearbyError()).toBe('home.nearbyGpsDenied');
    expect(fixture.componentInstance.nearbyItems()).toEqual([]);
  });

  it('updates kind signal', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.setNearbyKind('charge');
    expect(fixture.componentInstance.nearbyKind()).toBe('charge');
  });
});
