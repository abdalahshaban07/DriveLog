import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { NumericField } from '../../ui/numeric-field';
import { PrimaryButton } from '../../ui/primary-button';
import { OdometerScanState } from './odometer-scan-state';

/** Confirm/edit/cancel card for a scanned odometer. State: OdometerScanState. */
@Component({
  selector: 'app-odometer-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumericField, PrimaryButton],
  templateUrl: './odometer-review.html',
  styleUrl: './odometer-review.scss',
})
export class OdometerReview {
  readonly i18n = inject(I18n);
  readonly odo = inject(OdometerScanState);
}