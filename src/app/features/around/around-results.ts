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
  readonly kindChange = output<'fuel' | 'charge'>();
  readonly retry = output<void>();

  readonly list = computed(() => filterAroundPois(this.items(), this.kind()));

  readonly showOcmAttr = computed(() =>
    this.items().some((p) => p.source === 'ocm'),
  );

  mapsUrl(poi: NearbyPoi): string {
    return mapsSearchUrl(poi.lat, poi.lon, this.i18n.language());
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
}
