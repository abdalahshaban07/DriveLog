import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { I18n } from '../../../../i18n/i18n';
import { PrimaryButton } from '../../../../ui/primary-button';

@Component({
  selector: 'app-install-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PrimaryButton],
  template: `
    <section class="card install-card" [attr.aria-label]="i18n.t('home.install.title')">
      <div>
        <h2 class="install-card__title">{{ i18n.t('home.install.title') }}</h2>
        <p class="install-card__body">{{ i18n.t('home.install.body') }}</p>
      </div>
      <div class="install-card__actions">
        <app-primary-button
          [label]="i18n.t('home.install.action')"
          (pressed)="install.emit()"
        />
        <button type="button" class="ghost-btn" (click)="dismiss.emit()">
          {{ i18n.t('home.install.later') }}
        </button>
      </div>
    </section>
  `,
  styles: `
    :host { display: block; margin-block-end: var(--space-4); }
    .install-card__title { margin: 0 0 var(--space-1); font-size: 1rem; }
    .install-card__body { margin: 0 0 var(--space-3); color: var(--muted); font-size: 0.9rem; }
    .install-card__actions {
      display: grid;
      gap: var(--space-2);
    }
  `,
})
export class InstallCard {
  readonly i18n = inject(I18n);
  readonly install = output<void>();
  readonly dismiss = output<void>();
}
