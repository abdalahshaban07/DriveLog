import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { geocodePlace, getCoords } from '../../data/remote';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';

export const AROUND_MAP_ZOOM = 14;

type AroundKind = 'fuel' | 'charge';

function mapQuery(kind: AroundKind, lang: 'en' | 'ar'): string {
  switch (kind) {
    case 'fuel':
      return lang === 'ar' ? 'محطة بنزين' : 'gas station';
    case 'charge':
      return lang === 'ar' ? 'محطة شحن سيارات' : 'EV charging station';
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

/** Keyless Google embed. `ll` keeps the camera on the place; `t=m` stays on the road map where the pins sit. */
export function aroundMapEmbedUrl(
  origin: { lat: number; lon: number },
  kind: AroundKind,
  lang: 'en' | 'ar',
  zoom = AROUND_MAP_ZOOM,
  place = '',
): string {
  const base = mapQuery(kind, lang);
  const named = place.trim();
  const q = named ? (lang === 'ar' ? `${base} في ${named}` : `${base} in ${named}`) : base;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&ll=${origin.lat},${origin.lon}&z=${zoom}&hl=${lang}&t=m&output=embed`;
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
    return aroundMapEmbedUrl(origin, this.kind(), this.i18n.language(), AROUND_MAP_ZOOM, this.placeLabel());
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
    this.locating.set(true);
    this.gpsError.set('');
    this.areaError.set('');
    try {
      const coords = await getCoords();
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
