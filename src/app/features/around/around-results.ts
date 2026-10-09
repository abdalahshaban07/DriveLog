import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  mapsSearchUrl,
  type Coords,
  type NearbyConnector,
  type NearbyPoi,
} from '../../data/remote';
import { filterAroundPois, formatNearbyDistance } from '../../domain/around-filter';
import { I18n } from '../../i18n/i18n';

@Component({
  selector: 'app-around-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './around-results.html',
  styleUrl: './around-results.scss',
})
export class AroundResults {
  readonly i18n = inject(I18n);

  readonly items = input<NearbyPoi[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly kind = input<'fuel' | 'charge'>('fuel');
  readonly place = input('');
  readonly origin = input<Coords | null>(null);
  readonly kindChange = output<'fuel' | 'charge'>();
  readonly retry = output<void>();

  readonly list = computed(() => filterAroundPois(this.items(), this.kind()));
  readonly fuelCount = computed(
    () => this.items().filter((poi) => poi.kind === 'fuel').length,
  );
  readonly chargeCount = computed(
    () => this.items().filter((poi) => poi.kind === 'charge').length,
  );

  mapsUrl(poi: NearbyPoi): string {
    return mapsSearchUrl(poi.lat, poi.lon, this.i18n.language(), this.origin());
  }

  distanceLabel(poi: NearbyPoi): string {
    return formatNearbyDistance(
      poi.distanceKm,
      (n, opts) => this.i18n.formatNumber(n, opts),
      { m: this.i18n.t('common.m'), km: this.i18n.t('common.km') },
    );
  }

  speedLabel(speed: NearbyConnector['speed']): string {
    if (speed === 'fast') {
      return this.i18n.t('around.connectorFast');
    }
    if (speed === 'slow') {
      return this.i18n.t('around.connectorSlow');
    }
    return this.i18n.t('around.connectorMedium');
  }

  brandLabel(poi: NearbyPoi): string {
    const brand = poi.brand?.trim() ?? '';
    if (!brand || brand.toLowerCase() === poi.name.trim().toLowerCase()) {
      return '';
    }
    return brand;
  }

  fuelBits(poi: NearbyPoi): string[] {
    return (poi.detail ?? '')
      .split('·')
      .map((bit) => bit.trim())
      .filter(Boolean);
  }
}
