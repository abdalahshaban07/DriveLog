import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { WeatherNow } from '../../../../data/remote';
import { weatherKind } from '../../../../domain/weather';
import { weatherTipKey } from '../../../../domain/weather-tip';
import { I18n } from '../../../../i18n/i18n';

@Component({
  selector: 'app-weather-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (busy()) {
      <div class="skeleton skeleton--row wx__skel" aria-hidden="true"></div>
    } @else if (weather()) {
      <p class="wx" role="status" aria-live="polite" [attr.aria-label]="i18n.t('home.weather.title')">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          @switch (icon()) {
            @case ('sun') {
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
            }
            @case ('rain') {
              <path d="M7 15a4 4 0 0 1-.4-8 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 17 15z" />
              <path d="M9 17.5v2M12 17.5v2.5M15 17.5v2" />
            }
            @case ('snow') {
              <path d="M12 4v16M6 7.5l12 9M18 7.5l-12 9" />
            }
            @case ('cloud') {
              <path d="M7 16a4 4 0 0 1-.4-8 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 17 16z" />
            }
          }
        </svg>
        <span>{{ i18n.t(tipKey()) }}</span>
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .wx {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
    }
    .wx svg {
      width: 22px;
      height: 22px;
      flex: none;
      fill: none;
      stroke: var(--fuel);
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .wx span {
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.4;
    }
    .wx__skel {
      block-size: 1.4rem;
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

  readonly kind = computed(() => {
    const wx = this.weather();
    return wx ? weatherKind(wx.weatherCode) : 'other';
  });

  icon(): 'sun' | 'rain' | 'snow' | 'cloud' {
    if (this.tipKey() === 'home.weather.tip.heat') {
      return 'sun';
    }
    const kind = this.kind();
    switch (kind) {
      case 'clear':
        return 'sun';
      case 'rain':
        return 'rain';
      case 'snow':
        return 'snow';
      case 'other':
        return 'cloud';
      default: {
        const _never: never = kind;
        return _never;
      }
    }
  }
}
