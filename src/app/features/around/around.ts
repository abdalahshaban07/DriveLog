import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  coarseCoords,
  geocodePlace,
  mapsSearchUrl,
  nearbyAround,
  readCoords,
  stationsUpdated,
  type NearbyPoi,
} from '../../data/remote';
import {
  RADAR_CENTER,
  RADAR_RADIUS,
  approxDriveMinutes,
  radarPoint,
  radarRangeKm,
  radarSnake,
  type RadarXY,
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
const RADAR_SCALE = 6;
const RADAR_LABELS = 5;
const LIST_SHORT = 4;

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
  readonly rim = RADAR_RADIUS;

  readonly kind = signal<AroundKind>('fuel');
  readonly locating = signal(false);
  readonly gpsError = signal('');
  readonly areaText = signal('');
  readonly areaError = signal('');
  readonly placeLabel = signal('');
  readonly origin = signal<Origin | null>(null);
  /** True when the origin came from the IP lookup, not the device. */
  readonly approx = signal(false);

  readonly loadState = signal<LoadState>('loading');
  readonly stations = signal<NearbyPoi[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly showAll = signal(false);
  readonly updated = signal<string | null>(null);
  private loadSeq = 0;

  constructor() {
    void this.autoLocate();
  }

  readonly selected = computed((): NearbyPoi | null => {
    const list = this.stations();
    return list.find((s) => s.id === this.selectedId()) ?? list[0] ?? null;
  });

  readonly listed = computed(() =>
    this.showAll() ? this.stations() : this.stations().slice(0, LIST_SHORT),
  );

  /** Scaled to the nearest few so a tight cluster spreads out; farther pins sit on the rim. */
  readonly rangeKm = computed(() =>
    radarRangeKm(this.stations().slice(0, RADAR_SCALE).map((s) => s.distanceKm)),
  );

  readonly dots = computed(() => {
    const origin = this.origin();
    if (!origin) {
      return [];
    }
    const selected = this.selected()?.id;
    const dots = this.stations()
      .slice(0, RADAR_DOTS)
      .map((s, rank) => ({
        id: s.id,
        on: s.id === selected,
        rank,
        name: s.brand || s.name,
        label: '',
        ...radarPoint(origin, s, this.rangeKm()),
      }));
    // ponytail: greedy box check in the 0..100 viewBox; good for ≤5 labels, swap for real layout if more.
    const taken: RadarXY[] = [{ x: RADAR_CENTER, y: RADAR_CENTER }];
    for (const d of [...dots].sort((a, b) => Number(b.on) - Number(a.on) || a.rank - b.rank)) {
      const free = taken.every((t) => Math.abs(t.x - d.x) > 18 || Math.abs(t.y - d.y) > 6);
      if ((d.on || d.rank < RADAR_LABELS) && free) {
        d.label = d.name;
        taken.push(d);
      }
    }
    return dots;
  });

  readonly route = computed(() => {
    const dot = this.dots().find((d) => d.on);
    const s = this.selected();
    if (!dot || !s) {
      return null;
    }
    const snake = radarSnake(dot);
    const short = Math.hypot(snake.mid.x - RADAR_CENTER, snake.mid.y - RADAR_CENTER) < 10;
    return {
      d: snake.d,
      chip: short ? { x: dot.x, y: Math.max(6, dot.y - 12) } : snake.mid,
      eta: this.i18n.t('around.eta', { minutes: approxDriveMinutes(s.distanceKm) }),
    };
  });

  readonly googleUrl = computed(() => {
    const origin = this.origin();
    return origin ? aroundGoogleUrl(origin, this.kind(), this.i18n.language()) : '';
  });

  km(distanceKm: number): string {
    return this.i18n.formatUnit(distanceKm, 'common.km', distanceKm < 10 ? 1 : 0);
  }

  detail(s: NearbyPoi): string {
    return [s.brand && s.brand !== s.name ? s.brand : '', s.detail ?? ''].filter(Boolean).join(' · ');
  }

  directionsUrl(s: NearbyPoi): string {
    return mapsSearchUrl(s.lat, s.lon, this.i18n.language(), this.origin());
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
    this.approx.set(false);
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
      this.openAt(place, false, place.label);
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
    // readCoords must start in the click turn, before any signal write, or mobile skips the prompt.
    const geo = navigator.geolocation;
    const pending = geo ? readCoords(geo) : Promise.resolve(null);
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
      this.openAt(coords, !precise);
    } catch {
      this.gpsError.set(this.i18n.t('home.nearbyUnavailable'));
    } finally {
      this.locating.set(false);
    }
  }

  /** On open: device GPS only, no IP fallback; a failed fix leaves the finder as is. */
  private async autoLocate(): Promise<void> {
    const geo = navigator.geolocation;
    if (!geo) {
      return;
    }
    const state = await navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => p.state, () => undefined);
    if (state === 'denied') {
      this.gpsError.set(this.i18n.t('around.gpsDenied'));
      return;
    }
    const coords = await readCoords(geo);
    if (coords && !this.origin() && !this.locating()) {
      this.openAt(coords, false);
    }
  }

  private openAt(coords: Origin, approx: boolean, label = ''): void {
    this.placeLabel.set(label);
    this.approx.set(approx);
    this.origin.set({ lat: coords.lat, lon: coords.lon });
    void this.loadStations();
  }
}
