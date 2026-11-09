import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { OdometerScanState } from './odometer-scan-state';

/** Camera/gallery odometer scan row in the capture card. State: OdometerScanState. */
@Component({
  selector: 'app-odometer-scan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './odometer-scan.html',
  styleUrl: './odometer-scan.scss',
})
export class OdometerScan {
  readonly i18n = inject(I18n);
  readonly odo = inject(OdometerScanState);
}