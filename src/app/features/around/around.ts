import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { coarseCoords, geocodePlace } from '../../data/remote';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';

export const AROUND_MAP_ZOOM = 12;

type AroundKind = 'fuel' | 'charge';

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

/** Keyless Google embed. Plural `q` plus `ll` and a wide zoom is what fills a phone iframe with pins. */
export function aroundMapEmbedUrl(
  origin: { lat: number; lon: number },
  kind: AroundKind,
  lang: 'en' | 'ar',
  zoom = AROUND_MAP_ZOOM,
): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery(kind, lang))}&ll=${origin.lat},${origin.lon}&z=${zoom}&hl=${lang}&t=m&output=embed`;
}

/** Must be called in the click turn, before any signal write, or mobile skips the prompt. */
function fixFromPosition(geo: Geolocation): Promise<{ lat: number; lon: number } | null> {
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
  imports: [PageHeader, PrimaryButton, TextField, SectionTabs],
  templateUrl: './around.html',
  styleUrl: './around.scss',
})
export class AroundPage {
  readonly i18n = inject(I18n);
  private readonly sanitizer = inject(DomSanitizer);
  readonly tabs = FUEL_TABS;

  readonly kind = signal<AroundKind>('fuel');
  readonly locating = signal(false);
  readonly gpsError = signal('');
  readonly areaText = signal('');
  readonly areaError = signal('');
  readonly placeLabel = signal('');
  readonly origin = signal<{ lat: number; lon: number } | null>(null);

  readonly mapSrc = computed((): string => {
    const origin = this.origin();
    if (!origin) {
      return '';
    }
    return aroundMapEmbedUrl(origin, this.kind(), this.i18n.language());
  });

  readonly mapUrl = computed((): SafeResourceUrl | null => {
    const src = this.mapSrc();
    return src ? this.sanitizer.bypassSecurityTrustResourceUrl(src) : null;
  });

  setNearbyKind(kind: AroundKind): void {
    this.kind.set(kind);
  }

  changePlace(): void {
    this.origin.set(null);
    this.placeLabel.set('');
    this.gpsError.set('');
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
    } catch {
      this.gpsError.set(this.i18n.t('home.nearbyUnavailable'));
    } finally {
      this.locating.set(false);
    }
  }
}
