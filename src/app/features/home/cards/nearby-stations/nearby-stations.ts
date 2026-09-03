import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { mapsSearchUrl, type NearbyPoi } from '../../../../data/remote';
import { groupNearbyByBrand } from '../../../../domain/group-nearby-by-brand';
import { I18n } from '../../../../i18n/i18n';

@Component({
  selector: 'app-nearby-stations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nearby-stations.html',
  styleUrl: './nearby-stations.scss',
})
export class NearbyStations {
  readonly i18n = inject(I18n);

  readonly items = input<NearbyPoi[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly kind = input<'fuel' | 'charge'>('fuel');
  readonly kindChange = output<'fuel' | 'charge'>();

  readonly top = computed(() => this.items().slice(0, 3));
  readonly rest = computed(() => this.items().slice(3));
  readonly restGroups = computed(() => groupNearbyByBrand(this.rest()));

  mapsUrl(poi: NearbyPoi): string {
    return mapsSearchUrl(poi.lat, poi.lon, this.i18n.language());
  }

  groupLabel(brand: string, displayName?: string): string {
    return brand === 'other'
      ? this.i18n.t('home.nearbyOther')
      : (displayName ?? brand);
  }
}
