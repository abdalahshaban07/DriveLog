import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  coarseCoords,
  geocodePlace,
  mapsSearchUrl,
  nearbyAround,
  stationsUpdated,
  type NearbyPoi,
} from '../../data/remote';
import {
  RADAR_CENTER,
  RADAR_RADIUS,
  approxDriveMinutes,
  radarCurve,
  radarPoint,
  radarRangeKm,
} from '../../domain/around-radar';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';

type AroundKind = 'fuel' | 'charge';
type LoadState = 'loading' | 'ready' | 'error';
type Origin = { lat: number; lon: number };

const SEARCH_KM = 15;
const RADAR_DOTS = 12;
const LIST_SHORT = 5;

function mapQuery(kind: AroundKind, lang: 'en' | 'ar'): string {
  switch (kind) {
    case 'fuel':
      return lang === 'ar' ? 'محطات بنزين' : 'gas stations';
    case 'charge':
      return lang === 'ar' ? 'محطات شحن سيارات' : 'EV charging stations';
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

/** Keyless Google Maps search, for places our snapshot does not have. */
export function aroundGoogleUrl(origin: Origin, kind: AroundKind, lang: 'en' | 'ar'): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(mapQuery(kind, lang))}/@${origin.lat},${origin.lon},13z?hl=${lang}`;
}

/** Must be called in the click turn, before any signal write, or mobile skips the prompt. */
function fixFromPosition(geo: Geolocation): Promise<Origin | null> {
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}

@Component({
  selector: 'app-around-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PageLine, PrimaryButton, TextField, SectionTabs],
  templateUrl: './around.html',
  styleUrl: './around.scss',
})
export class AroundPage {
  readonly i18n = inject(I18n);
  readonly tabs = FUEL_TABS;
  readonly center = RADAR_CENTER;
  readonly rings = [RADAR_RADIUS / 3, (RADAR_RADIUS * 2) / 3, RADAR_RADIUS];

  readonly kind = signal<AroundKind>('fuel');
  readonly locating = signal(false);
  readonly gpsError = signal('');
  readonly areaText = signal('');
  readonly areaError = signal('');
  readonly placeLabel = signal('');
  readonly origin = signal<Origin | null>(null);

  readonly loadState = signal<LoadState>('loading');
  readonly stations = signal<NearbyPoi[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly showAll = signal(false);
  readonly updated = signal<string | null>(null);
  private loadSeq = 0;

  readonly selected = computed((): NearbyPoi | null => {
    const list = this.stations();
    return list.find((s) => s.id === this.selectedId()) ?? list[0] ?? null;
  });

  readonly listed = computed(() =>
    this.showAll() ? this.stations() : this.stations().slice(0, LIST_SHORT),
  );

  readonly rangeKm = computed(() =>
    radarRangeKm(this.stations().slice(0, RADAR_DOTS).map((s) => s.distanceKm)),
  );

  readonly dots = computed(() => {
    const origin = this.origin();
    if (!origin) {
      return [];
    }
    const selected = this.selected()?.id;
    return this.stations()
      .slice(0, RADAR_DOTS)
      .map((s) => ({ id: s.id, on: s.id === selected, ...radarPoint(origin, s, this.rangeKm()) }));
  });

  readonly route = computed(() => {
    const dot = this.dots().find((d) => d.on);
    return dot ? radarCurve(dot) : '';
  });

  readonly directionsUrl = computed(() => {
    const s = this.selected();
    return s ? mapsSearchUrl(s.lat, s.lon, this.i18n.language(), this.origin()) : '';
  });

  readonly googleUrl = computed(() => {
    const origin = this.origin();
    return origin ? aroundGoogleUrl(origin, this.kind(), this.i18n.language()) : '';
  });

  km(distanceKm: number): string {
    return this.i18n.formatUnit(distanceKm, 'common.km', distanceKm < 10 ? 1 : 0);
  }

  meta(s: NearbyPoi): string[] {
    return [
      s.brand && s.brand !== s.name ? s.brand : '',
      s.detail ?? '',
      this.km(s.distanceKm),
      this.i18n.t('around.eta', { minutes: approxDriveMinutes(s.distanceKm) }),
    ].filter(Boolean);
  }

  setNearbyKind(kind: AroundKind): void {
    if (kind === this.kind()) {
      return;
    }
    this.kind.set(kind);
    void this.loadStations();
  }

  select(id: number): void {
    this.selectedId.set(id);
  }

  changePlace(): void {
    this.origin.set(null);
    this.placeLabel.set('');
    this.gpsError.set('');
    this.stations.set([]);
  }

  async loadStations(): Promise<void> {
    const origin = this.origin();
    if (!origin) {
      return;
    }
    const seq = ++this.loadSeq;
    this.loadState.set('loading');
    this.selectedId.set(null);
    this.showAll.set(false);
    try {
      const [list, updated] = await Promise.all([
        nearbyAround(origin, SEARCH_KM, this.kind()),
        stationsUpdated(),
      ]);
      if (seq !== this.loadSeq) {
        return;
      }
      this.stations.set(list);
      this.updated.set(updated);
      this.loadState.set('ready');
    } catch {
      if (seq === this.loadSeq) {
        this.stations.set([]);
        this.loadState.set('error');
      }
    }
  }

  async searchArea(): Promise<void> {
    if (this.locating()) {
      return;
    }
    const query = this.areaText().trim();
    if (!query) {
      this.areaError.set(this.i18n.t('around.areaError'));
      return;
    }
    this.areaError.set('');
    this.gpsError.set('');
    this.locating.set(true);
    try {
      const place = await geocodePlace(query, this.i18n.language());
      if (!place) {
        this.areaError.set(this.i18n.t('around.areaMiss'));
        return;
      }
      this.placeLabel.set(place.label);
      this.origin.set({ lat: place.lat, lon: place.lon });
      void this.loadStations();
    } catch {
      this.gpsError.set(this.i18n.t('home.nearbyUnavailable'));
    } finally {
      this.locating.set(false);
    }
  }

  async useMyLocation(): Promise<void> {
    if (this.locating()) {
      return;
    }
    const geo = navigator.geolocation;
    const pending = geo ? fixFromPosition(geo) : Promise.resolve(null);
    this.locating.set(true);
    this.gpsError.set('');
    this.areaError.set('');
    try {
      const precise = await pending;
      const coords = precise ?? (await coarseCoords());
      if (!coords) {
        this.gpsError.set(this.i18n.t('around.gpsDenied'));
        return;
      }
      this.placeLabel.set('');
      this.origin.set(coords);
      void this.loadStations();
    } catch {
      this.gpsError.set(this.i18n.t('home.nearbyUnavailable'));
    } finally {
      this.locating.set(false);
    }
  }
}
