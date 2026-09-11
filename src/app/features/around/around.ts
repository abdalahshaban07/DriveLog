import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { getCoords, nearbyAround, type NearbyPoi } from '../../data/remote';
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
import { AroundResults } from './around-results';

@Component({
  selector: 'app-around-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, AroundResults, PrimaryButton, NumericField],
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
  readonly rangeText = signal(String(AROUND_RADIUS_DEFAULT_KM));
  readonly rangeKm = signal(AROUND_RADIUS_DEFAULT_KM);
  readonly rangeError = signal('');

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
      void this.useMyLocation();
    }
  }

  async useMyLocation(): Promise<void> {
    this.onRange(this.rangeText());
    if (this.rangeError()) {
      return;
    }
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
      const list = await nearbyAround(coords, this.rangeKm());
      this.nearbyItems.set(list);
    } catch {
      this.nearbyError.set(this.i18n.t('home.nearbyUnavailable'));
      this.nearbyItems.set([]);
    } finally {
      this.nearbyLoading.set(false);
    }
  }
}
