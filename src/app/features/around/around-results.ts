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

type CardFact = { text: string; tone: 'ok' | 'shut' | 'quiet' };

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

  /** One quiet line: status, hours, place, fuel. A Latin brand under an Arabic name is the same station. */
  facts(poi: NearbyPoi): CardFact[] {
    const bits: CardFact[] = [];
    if (poi.openNow === true) {
      bits.push({ text: this.i18n.t('around.openNow'), tone: 'ok' });
    } else if (poi.openNow === false) {
      bits.push({ text: this.i18n.t('around.closed'), tone: 'shut' });
    }
    const brand = this.brandLabel(poi);
    if (brand) {
      bits.push({ text: brand, tone: 'quiet' });
    }
    const hours = this.hoursText(poi.openingHours);
    if (hours) {
      bits.push({ text: hours, tone: 'quiet' });
    }
    const address = poi.addressLine?.trim() ?? '';
    if (address) {
      bits.push({ text: address, tone: 'quiet' });
    }
    const extra = poi.kind === 'fuel' ? this.fuelBits(poi) : this.chargeBits(poi);
    for (const bit of extra) {
      bits.push({ text: bit, tone: 'quiet' });
    }
    return bits;
  }

  private brandLabel(poi: NearbyPoi): string {
    const brand = poi.brand?.trim() ?? '';
    const name = poi.name.trim();
    if (!brand || brand.toLowerCase() === name.toLowerCase()) {
      return '';
    }
    if (/[\u0600-\u06FF]/.test(name) && !/[\u0600-\u06FF]/.test(brand)) {
      return '';
    }
    return brand;
  }

  private hoursText(raw: string | undefined): string {
    if (!raw) {
      return '';
    }
    const flat = raw.replace(/\s+/g, '').toLowerCase();
    if (flat === '24/7' || flat === '24/7;24/7') {
      return this.i18n.t('around.allDay');
    }
    return raw;
  }

  private fuelBits(poi: NearbyPoi): string[] {
    return (poi.detail ?? '')
      .split('·')
      .map((bit) => bit.trim())
      .filter(Boolean)
      .map((bit) => {
        if (bit === 'diesel') {
          return this.i18n.t('fillUp.grade.solar');
        }
        if (bit === '95') {
          return this.i18n.t('fillUp.grade.gasoline95');
        }
        return bit;
      });
  }

  private chargeBits(poi: NearbyPoi): string[] {
    return (poi.connectors ?? []).map((plug) => {
      const parts = [plug.type];
      if (plug.powerKw != null) {
        parts.push(`${this.i18n.formatNumber(plug.powerKw)} kW`);
      } else if (plug.speed) {
        parts.push(this.speedLabel(plug.speed));
      }
      return parts.join(' ');
    });
  }
}
