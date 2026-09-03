import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { I18n } from '../../../../i18n/i18n';

@Component({
  selector: 'app-sample-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card--dark sample-banner" role="status" [attr.aria-label]="i18n.t('home.sample.title')">
      <div>
        <h2 class="sample-banner__title">{{ i18n.t('home.sample.title') }}</h2>
        <p class="sample-banner__body">{{ i18n.t('home.sample.body') }}</p>
      </div>
      <button type="button" class="sample-banner__btn" (click)="clear.emit()">
        {{ i18n.t('home.sample.clear') }}
      </button>
    </section>
  `,
  styles: `
    :host { display: block; margin-block-end: var(--space-4); }
    .sample-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .sample-banner__title { margin: 0 0 var(--space-1); font-size: 1rem; }
    .sample-banner__body { margin: 0; color: var(--muted); font-size: 0.9rem; }
    .sample-banner__btn {
      min-height: var(--tap);
      padding-inline: var(--space-4);
      border: 0;
      border-radius: calc(var(--radius) - 4px);
      background: var(--cta);
      color: var(--cta-text);
      font-weight: 700;
      cursor: pointer;
    }
  `,
})
export class SampleBanner {
  readonly i18n = inject(I18n);
  readonly clear = output<void>();
}
