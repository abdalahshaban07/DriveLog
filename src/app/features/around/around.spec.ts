import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AroundPage, aroundGoogleUrl } from './around';
import { I18n } from '../../i18n/i18n';

describe('aroundGoogleUrl', () => {
  it('searches the category around the point without an API key', () => {
    const url = aroundGoogleUrl({ lat: 30.0444, lon: 31.2357 }, 'charge', 'en');
    expect(url).toBe(
      'https://www.google.com/maps/search/EV%20charging%20stations/@30.0444,31.2357,13z?hl=en',
    );
    expect(url).not.toContain('key=');
  });
});

const STATIONS = {
  updated: '2026-10-01',
  fuel: [
    [30.05, 31.24, 'Shell Tahrir', 'Shell'],
    [30.07, 31.26, 'Total Ramses', 'TotalEnergies'],
  ],
  charge: [[30.045, 31.235, 'Mall EV', 'Infinity EV', 60]],
};

/** Station file for data/ URLs, the given payload for anything else (geojs). */
function stubFetch(other: unknown = null, stations: unknown = STATIONS): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = url.startsWith('data/') ? stations : other;
      return body == null
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve({ ok: true, json: async () => body });
    }),
  );
}

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

type Answer = (ok: PositionCallback, err?: PositionErrorCallback | null) => void;

function stubGeo(answer: Answer | undefined): void {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: answer && {
      getCurrentPosition: answer,
      watchPosition(ok: PositionCallback, err?: PositionErrorCallback | null) {
        answer(ok, err);
        return 1;
      },
      clearWatch() {},
    },
  });
}

function stubPermission(state: PermissionState | undefined): void {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: state && { query: async () => ({ state }) },
  });
}

const deny: Answer = (_ok, err) => err?.({ code: 1, message: 'denied' } as GeolocationPositionError);

describe('AroundPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    stubGeo(undefined);
    stubPermission(undefined);
    await TestBed.configureTestingModule({
      imports: [AroundPage],
      providers: [
        provideRouter([]),
        {
          provide: I18n,
          useValue: {
            t: (k: string) => k,
            formatNumber: (n: number) => String(n),
            formatUnit: (n: number, unit: string) => `${n} ${unit}`,
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

  it('does not draw the radar until a place is chosen', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.nativeElement.querySelector('.around-radar')).toBeNull();
  });

  it('draws nearby stations for the chosen kind, nearest first', async () => {
    stubFetch();
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.origin.set({ lat: 30.04, lon: 31.23 });
    await fixture.componentInstance.loadStations();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.around-map__pin')).toHaveLength(2);
    expect(el.querySelector('.around-card--on .around-card__name')?.textContent).toContain('Shell Tahrir');
    expect(el.querySelector('.around-map__road')).toBeTruthy();
    expect(el.querySelector('.around-map__chip')?.textContent).toContain('around.eta');
    expect(el.querySelector('.around-map__label--on')?.textContent).toBe('Shell');
    expect(el.querySelector('.around-card__go')?.getAttribute('href')).toContain(
      'origin=30.04,31.23&destination=30.05,31.24',
    );
    expect(el.querySelector('.around-updated')?.textContent).toContain('around.updated');

    fixture.componentInstance.setNearbyKind('charge');
    await fixture.componentInstance.loadStations();
    fixture.detectChanges();
    expect(el.querySelectorAll('.around-map__pin')).toHaveLength(1);
    expect(el.querySelector('.around-card--on .around-card__name')?.textContent).toContain('Mall EV');
  });

  it('moves the route when another station is picked from the list', async () => {
    stubFetch();
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.origin.set({ lat: 30.04, lon: 31.23 });
    await fixture.componentInstance.loadStations();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.around-card__pick') as NodeListOf<HTMLButtonElement>;
    const firstRoute = fixture.nativeElement.querySelector('.around-map__road')?.getAttribute('d');
    cards[1]!.click();
    fixture.detectChanges();
    expect(cards[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.around-card--on .around-card__name')?.textContent).toContain(
      'Total Ramses',
    );
    expect(fixture.nativeElement.querySelector('.around-map__road')?.getAttribute('d')).not.toBe(firstRoute);
  });

  it('shows an empty state and the Google fallback when nothing is near', async () => {
    stubFetch();
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.origin.set({ lat: 24.1, lon: 32.9 });
    await fixture.componentInstance.loadStations();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state')?.textContent).toContain('home.nearbyEmpty');
    expect(el.querySelector('.around-google')?.getAttribute('href')).toContain('google.com/maps/search');
  });

  it('returns to the finder when the place changes', () => {
    const fixture = TestBed.createComponent(AroundPage);
    fixture.componentInstance.origin.set({ lat: 30, lon: 31 });
    fixture.componentInstance.placeLabel.set('المعادي');
    fixture.componentInstance.changePlace();
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.nativeElement.querySelector('.around-radar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.around-finder')).toBeTruthy();
  });

  it('asks for GPS on open and uses the exact device fix', async () => {
    stubGeo((ok) => ok(here(30.0444, 31.2357)));
    stubPermission('prompt');
    stubFetch();
    const fixture = TestBed.createComponent(AroundPage);
    await vi.waitFor(() => expect(fixture.componentInstance.origin()).toEqual({ lat: 30.0444, lon: 31.2357 }));
    expect(fixture.componentInstance.approx()).toBe(false);
  });

  it('stays on the finder without the IP fallback when GPS fails on open', async () => {
    stubGeo(deny);
    stubFetch({ latitude: '29.07', longitude: '31.09' });
    const fixture = TestBed.createComponent(AroundPage);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the blocked message on open when permission is denied', async () => {
    stubGeo(deny);
    stubPermission('denied');
    const fixture = TestBed.createComponent(AroundPage);
    await vi.waitFor(() => expect(fixture.componentInstance.gpsError()).toBe('around.gpsDenied'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.around-finder [role=alert]')).toBeTruthy();
  });

  it('stays on the finder when location and the coarse fix both fail', async () => {
    stubFetch(null, null);
    const fixture = TestBed.createComponent(AroundPage);
    stubGeo(deny);
    fixture.detectChanges();
    await fixture.componentInstance.useMyLocation();
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toBeNull();
    expect(fixture.componentInstance.gpsError()).toBe('around.gpsDenied');
    expect(fixture.nativeElement.querySelector('.around-radar')).toBeNull();
  });

  it('opens the radar at the exact GPS fix, with no area label or approx note', async () => {
    stubFetch({ latitude: '29.07', longitude: '31.09' });
    const fixture = TestBed.createComponent(AroundPage);
    stubGeo((ok) => ok(here(30.0444, 31.2357)));
    fixture.detectChanges();
    await fixture.componentInstance.useMyLocation();
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toEqual({ lat: 30.0444, lon: 31.2357 });
    expect(fixture.nativeElement.querySelector('.around-radar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.around-place')).toBeNull();
    expect(fixture.nativeElement.querySelector('.around-approx')).toBeNull();
  });

  it('falls back to the coarse fix with an approx note when the browser blocks GPS', async () => {
    stubFetch({ latitude: '29.07', longitude: '31.09' });
    const fixture = TestBed.createComponent(AroundPage);
    stubGeo(deny);
    fixture.detectChanges();
    await fixture.componentInstance.useMyLocation();
    fixture.detectChanges();
    expect(fixture.componentInstance.origin()).toEqual({ lat: 29.07, lon: 31.09 });
    expect(fixture.nativeElement.querySelector('.around-radar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.around-approx')?.textContent).toContain('around.approx');
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
