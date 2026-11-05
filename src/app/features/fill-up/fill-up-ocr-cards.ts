import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { NumericField } from '../../ui/numeric-field';
import { PrimaryButton } from '../../ui/primary-button';
import { FillUpScanState } from './fill-up-scan-state';

/** Shared-receipt preview + OCR review cards. State lives in FillUpScanState. */
@Component({
  selector: 'app-fill-up-ocr-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumericField, PrimaryButton],
  templateUrl: './fill-up-ocr-cards.html',
  styleUrl: './fill-up-ocr-cards.scss',
})
export class FillUpOcrCards {
  readonly i18n = inject(I18n);
  readonly scan = inject(FillUpScanState);
}
