import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AroundPage, aroundMapEmbedUrl } from './around';
import { I18n } from '../../i18n/i18n';

describe('aroundMapEmbedUrl', () => {
  it('centers a fuel search without an API key', () => {
    const url = aroundMapEmbedUrl({ lat: 30.0444, lon: 31.2357 }, 'fuel', 'ar');
    expect(url).toBe(
      'https://maps.google.com/maps?q=%D9%85%D8%AD%D8%B7%D8%A7%D8%AA%20%D8%A8%D9%86%D8%B2%D9%8A%D9%86&ll=30.0444,31.2357&z=12&hl=ar&t=m&output=embed',
    );
    expect(url).not.toContain('key=');
  });

  it('keeps the camera on the coordinates and the query on the category', () => {
    const url = aroundMapEmbedUrl({ lat: 29.03, lon: 31.1 }, 'fuel', 'ar');
    expect(url).toContain(encodeURIComponent('محطات بنزين'));
    expect(url).not.toContain(encodeURIComponent('في'));
    expect(url).toContain('ll=29.03,31.1');
    expect(url).toContain('z=12');
    expect(url).toContain('t=m');
  });

  it('switches the query for charging stations', () => {
    const url = aroundMapEmbedUrl({ lat: 30, lon: 31 }, 'charge', 'en', 12);
    expect(url).toContain('q=EV%20charging%20stations');
    expect(url).toContain('ll=30,31');
    expect(url).toContain('z=12');
    expect(url).toContain('t=m');
    expect(url).toContain('hl=en');
  });
});

function here(lat: number, lon: number): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy: 20,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return {};
      },
    },
    timestamp: 0,
    toJSON() {
      return {};
    },
  };
}

function stubGeo(getCurrentPosition: Geolocation['getCurrentPosition']): void {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
      watchPosition() {
        return 0;
      },
      clearWatch() {},
    },
  });
}

describe('AroundPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AroundPage],
      providers: [
        provideRouter([]),
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

  it('keeps area search quieter than use my location', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css('app-primary-button'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].componentInstance.tone()).toBe('fuel');
    expect(buttons[1].componentInstance.tone()).toBe('quiet');
  });

  it('does not show a map until a place is chosen', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.componentInstance.mapUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('embeds the map for the chosen kind', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.origin.set({ lat: 30.0444, lon: 31.2357 });
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('output=embed');
    expect(frame.getAttribute('src')).toContain('ll=30.0444,31.2357');
    expect(frame.getAttribute('src')).toContain('gas%20stations');
    expect(frame.getAttribute('src')).toContain('z=12');

    fixture.componentInstance.setNearbyKind('charge');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toContain(
      'EV%20charging%20stations',
    );
  });

  it('returns to the finder when the place changes', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.origin.set({ lat: 30, lon: 31 });
    fixture.componentInstance.placeLabel.set('المعادي');
    fixture.componentInstance.changePlace();
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('.around-finder')).toBeTruthy();
  });

  it('does not request location until the CTA is used', async () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.locating()).toBe(false);
    expect(fixture.componentInstance.gpsError()).toBe('');
  });

  it('stays on the finder when location and the coarse fix both fail', async () => {
    stubGeo((_ok, err) => {
      err?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    await fixture.componentInstance.useMyLocation();
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.componentInstance.gpsError()).toBe('around.gpsDenied');
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('opens the map from a GPS fix without calling it approximate', async () => {
    stubGeo((ok) => {
      ok(here(30.04, 31.23));
    });
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    await fixture.componentInstance.useMyLocation();
    expect(fixture.componentInstance.origin()).toEqual({ lat: 30.04, lon: 31.23 });
    expect(fixture.componentInstance.approx()).toBe(false);
  });

  it('opens an approximate map when the browser blocks GPS', async () => {
    stubGeo((_ok, err) => {
      err?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ latitude: '29.07', longitude: '31.09' }),
      }),
    );
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    await fixture.componentInstance.useMyLocation();
    expect(fixture.componentInstance.approx()).toBe(true);
    expect(fixture.componentInstance.origin()).toEqual({ lat: 29.07, lon: 31.09 });
    expect(fixture.componentInstance.gpsError()).toBe('');
  });

  it('does not search a blank area name', async () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.areaText.set('   ');
    await fixture.componentInstance.searchArea();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.componentInstance.areaError()).toBe('around.areaError');
  });
});
