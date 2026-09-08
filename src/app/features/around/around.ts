import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { getCoords, nearbyPoi, type NearbyPoi } from '../../data/remote';
import { I18n } from '../../i18n/i18n';
import { AmbientCanvas } from '../../ui/ambient-canvas/ambient-canvas';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { NearbyStations } from '../home/cards/nearby-stations/nearby-stations';

@Component({
  selector: 'app-around-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, AmbientCanvas, NearbyStations, PrimaryButton],
  templateUrl: './around.html',
  styleUrl: './around.scss',
})
export class AroundPage {
  readonly i18n = inject(I18n);

  readonly requested = signal(false);
  readonly nearbyKind = signal<'fuel' | 'charge'>('fuel');
  readonly nearbyLoading = signal(false);
  readonly nearbyError = signal<string | null>(null);
  readonly nearbyItems = signal<NearbyPoi[]>([]);

  readonly filteredNearby = computed(() =>
    this.nearbyItems().filter((poi) => poi.kind === this.nearbyKind()),
  );

  setNearbyKind(kind: 'fuel' | 'charge'): void {
    this.nearbyKind.set(kind);
  }

  async useMyLocation(): Promise<void> {
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
      const list = await nearbyPoi(coords);
      this.nearbyItems.set(list);
    } catch {
      this.nearbyError.set(this.i18n.t('home.nearbyUnavailable'));
      this.nearbyItems.set([]);
    } finally {
      this.nearbyLoading.set(false);
    }
  }
}
