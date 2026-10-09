import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  geocodePlace,
  getCoords,
  nearbyAround,
  readAroundCache,
  writeAroundCache,
  type NearbyPoi,
} from '../../data/remote';
import {
  AROUND_RADIUS_DEFAULT_KM,
  AROUND_RADIUS_MAX_KM,
  AROUND_RADIUS_MIN_KM,
  clampAroundRadiusKm,
} from '../../domain/around-filter';
import { I18n } from '../../i18n/i18n';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';
import { AroundResults } from './around-results';

@Component({
  selector: 'app-around-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    AroundResults,
    PrimaryButton,
    NumericField,
    TextField,
    SectionTabs,
  ],
  templateUrl: './around.html',
  styleUrl: './around.scss',
})
export class AroundPage {
  readonly i18n = inject(I18n);
  readonly tabs = FUEL_TABS;

  readonly requested = signal(false);
  readonly nearbyKind = signal<'fuel' | 'charge'>('fuel');
  readonly nearbyLoading = signal(false);
  readonly nearbyError = signal<string | null>(null);
  readonly nearbyItems = signal<NearbyPoi[]>([]);
  readonly rangeText = signal(String(AROUND_RADIUS_DEFAULT_KM));
  readonly rangeKm = signal(AROUND_RADIUS_DEFAULT_KM);
  readonly rangeError = signal('');
  readonly areaText = signal('');
  readonly areaError = signal('');
  private readonly locateMode = signal<'gps' | 'area'>('gps');

  setNearbyKind(kind: 'fuel' | 'charge'): void {
    this.nearbyKind.set(kind);
  }

  onRange(raw: string): void {
    this.rangeText.set(raw);
    const n = Number(raw);
    if (
      !Number.isFinite(n) ||
      n < AROUND_RADIUS_MIN_KM ||
      n > AROUND_RADIUS_MAX_KM
    ) {
      this.rangeError.set(this.i18n.t('around.rangeError'));
      return;
    }
    this.rangeError.set('');
    this.rangeKm.set(clampAroundRadiusKm(n));
  }

  onRangeCommit(): void {
    this.onRange(this.rangeText());
    if (!this.rangeError() && this.requested()) {
      if (this.locateMode() === 'area') {
        void this.searchArea();
      } else {
        void this.useMyLocation();
      }
    }
  }

  async searchArea(): Promise<void> {
    this.onRange(this.rangeText());
    if (this.rangeError() || this.nearbyLoading()) {
      return;
    }
    const query = this.areaText().trim();
    if (!query) {
      this.areaError.set(this.i18n.t('around.areaError'));
      return;
    }
    this.areaError.set('');
    this.locateMode.set('area');
    this.requested.set(true);
    this.nearbyLoading.set(true);
    this.nearbyError.set(null);
    try {
      const coords = await geocodePlace(query, this.i18n.language());
      if (!coords) {
        this.nearbyError.set(this.i18n.t('around.areaMiss'));
        this.nearbyItems.set([]);
        return;
      }
      this.rememberAround(coords, await nearbyAround(coords, this.rangeKm()));
    } catch {
      this.failAround();
    } finally {
      this.nearbyLoading.set(false);
    }
  }

  retrySearch(): void {
    if (this.locateMode() === 'area') {
      void this.searchArea();
      return;
    }
    void this.useMyLocation();
  }

  async useMyLocation(): Promise<void> {
    this.onRange(this.rangeText());
    if (this.rangeError() || this.nearbyLoading()) {
      return;
    }
    this.locateMode.set('gps');
    this.requested.set(true);
    this.nearbyLoading.set(true);
    this.nearbyError.set(null);
    try {
      const coords = await getCoords();
      if (!coords) {
        this.nearbyError.set(this.i18n.t('home.nearbyGpsDenied'));
        this.nearbyItems.set([]);
        return;
      }
      this.rememberAround(coords, await nearbyAround(coords, this.rangeKm()));
    } catch {
      this.failAround();
    } finally {
      this.nearbyLoading.set(false);
    }
  }

  private rememberAround(origin: { lat: number; lon: number }, items: NearbyPoi[]): void {
    this.nearbyItems.set(items);
    if (!items.length) {
      return;
    }
    writeAroundCache({
      lat: origin.lat,
      lon: origin.lon,
      radiusKm: this.rangeKm(),
      items,
      savedAt: Date.now(),
    });
  }

  private failAround(): void {
    const cached = readAroundCache();
    if (cached?.items.length) {
      this.nearbyItems.set(cached.items);
      this.nearbyError.set(this.i18n.t('around.cached'));
      return;
    }
    this.nearbyError.set(this.i18n.t('home.nearbyUnavailable'));
    this.nearbyItems.set([]);
  }
}
