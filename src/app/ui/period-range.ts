import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import type { HistoryRangePreset } from '../domain/export-history';
import { I18n } from '../i18n/i18n';
import type { MsgKey } from '../i18n/en';
import { DateField } from './date-field';

const PRESETS: readonly { id: HistoryRangePreset; labelKey: MsgKey }[] = [
  { id: 'thisMonth', labelKey: 'history.rangeThisMonth' },
  { id: '3months', labelKey: 'history.range3Months' },
  { id: 'year', labelKey: 'history.rangeYear' },
  { id: 'custom', labelKey: 'history.rangeCustom' },
];

@Component({
  selector: 'app-period-range',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateField],
  template: `
    <div class="period-range">
      <p class="period-range__label">{{ i18n.t('history.range') }}</p>
      <div class="history-range" role="tablist" [attr.aria-label]="i18n.t('history.range')">
        @for (preset of presets; track preset.id) {
          <button
            type="button"
            role="tab"
            class="history-range__btn"
            [class.history-range__btn--on]="value() === preset.id"
            [attr.aria-selected]="value() === preset.id"
            (click)="pick(preset.id)"
          >
            {{ i18n.t(preset.labelKey) }}
          </button>
        }
      </div>
      @if (value() === 'custom') {
        <div class="history-filter__dates">
          <app-date-field
            [label]="i18n.t('history.from')"
            [value]="from()"
            (valueChange)="from.set($event)"
          />
          <app-date-field
            [label]="i18n.t('history.to')"
            [value]="to()"
            (valueChange)="to.set($event)"
          />
        </div>
      }
    </div>
  `,
})
export class PeriodRange {
  readonly i18n = inject(I18n);
  readonly presets = PRESETS;
  readonly value = input.required<HistoryRangePreset>();
  readonly from = model('');
  readonly to = model('');
  readonly valueChange = output<HistoryRangePreset>();

  pick(id: HistoryRangePreset): void {
    this.valueChange.emit(id);
  }
}
