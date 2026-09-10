import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { WeatherNow } from '../../../../data/remote';
import { weatherKind, weatherMsgKey } from '../../../../domain/weather';
import { weatherTipKey } from '../../../../domain/weather-tip';
import { I18n } from '../../../../i18n/i18n';
import type { MsgKey } from '../../../../i18n/en';

@Component({
  selector: 'app-weather-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (busy()) {
      <div class="skeleton skeleton--row weather-tip__skel" aria-hidden="true"></div>
    } @else if (weather(); as wx) {
      <section
        class="weather-tip"
        role="status"
        aria-live="polite"
        [attr.aria-label]="i18n.t('home.weather.title')"
        [class.weather-tip--rain]="kind() === 'rain' || kind() === 'snow'"
        [class.weather-tip--heat]="tipKey() === 'home.weather.tip.heat'"
      >
        <header class="weather-tip__head">
          <h3 class="weather-tip__title">{{ i18n.t('home.weather.title') }}</h3>
          <p class="weather-tip__meta">
            <span class="weather-tip__temp">{{ tempLabel() }}</span>
            <span class="weather-tip__kind">{{ i18n.t(kindKey()) }}</span>
          </p>
        </header>
        <p class="weather-tip__text">{{ i18n.t(tipKey()) }}</p>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-block-end: var(--space-4);
    }
    .weather-tip__skel {
      margin-block-end: var(--space-4);
    }
    .weather-tip {
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius);
      background: var(--metric-tint);
      border: 1px solid var(--hairline);
      border-inline-start: 3px solid var(--petrol-muted);
    }
    .weather-tip--rain {
      border-inline-start-color: var(--warn);
    }
    .weather-tip--heat {
      border-inline-start-color: var(--cta);
    }
    .weather-tip__head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
      margin-block-end: var(--space-1);
    }
    .weather-tip__title {
      margin: 0;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .weather-tip__meta {
      margin: 0;
      display: flex;
      gap: var(--space-2);
      align-items: baseline;
      font-variant-numeric: tabular-nums;
    }
    .weather-tip__temp {
      font-weight: 700;
      color: var(--text);
    }
    .weather-tip__kind {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .weather-tip__text {
      margin: 0;
      font-weight: 600;
      line-height: 1.45;
    }
  `,
})
export class WeatherTipCard {
  readonly i18n = inject(I18n);
  readonly weather = input<WeatherNow | null>(null);
  readonly busy = input(false);

  readonly tipKey = computed(() => {
    const wx = this.weather();
    if (!wx) {
      return 'home.weather.tip.other' as const;
    }
    return weatherTipKey(wx.tempC, wx.weatherCode);
  });

  readonly kindKey = computed((): MsgKey => {
    const wx = this.weather();
    return wx ? weatherMsgKey(wx.weatherCode) : 'weather.other';
  });

  readonly kind = computed(() => {
    const wx = this.weather();
    return wx ? weatherKind(wx.weatherCode) : 'other';
  });

  tempLabel(): string {
    const wx = this.weather();
    if (!wx) {
      return '';
    }
    return `${this.i18n.formatNumber(wx.tempC, { maximumFractionDigits: 0 })}°C`;
  }
}
