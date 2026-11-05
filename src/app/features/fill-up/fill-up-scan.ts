import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { FillUpScanState } from './fill-up-scan-state';

/** Camera/gallery scan row of the fill-up console. State lives in FillUpScanState. */
@Component({
  selector: 'app-fill-up-scan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fill-up-scan.html',
  styleUrl: './fill-up-scan.scss',
})
export class FillUpScan {
  readonly i18n = inject(I18n);
  readonly scan = inject(FillUpScanState);
}
