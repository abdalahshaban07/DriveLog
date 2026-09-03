import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../../i18n/i18n';
import type { MsgKey } from '../../../../i18n/en';

export type ChecklistItem = {
  id: string;
  done: boolean;
  labelKey: MsgKey;
  route: string;
};

@Component({
  selector: 'app-setup-checklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="card checklist" [attr.aria-label]="i18n.t('home.checklist.title')">
      <header class="checklist__head">
        <h2 class="checklist__title">{{ i18n.t('home.checklist.title') }}</h2>
        <button type="button" class="checklist__dismiss" (click)="dismiss.emit()">
          {{ i18n.t('home.checklist.dismiss') }}
        </button>
      </header>
      <div
        class="checklist__bar"
        role="progressbar"
        [attr.aria-valuenow]="doneCount()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="items().length"
      >
        <span class="checklist__fill" [style.width.%]="progressPct()"></span>
      </div>
      <ul class="checklist__list">
        @for (item of items(); track item.id) {
          <li>
            <a class="checklist__row" [routerLink]="item.route">
              <span class="checklist__check" [class.checklist__check--on]="item.done" aria-hidden="true"></span>
              <span>{{ i18n.t(item.labelKey) }}</span>
            </a>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host { display: block; margin-block-end: var(--space-4); }
    .checklist__head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      margin-block-end: var(--space-3);
    }
    .checklist__title { margin: 0; font-size: 1rem; }
    .checklist__dismiss {
      border: 0;
      background: transparent;
      color: var(--muted);
      font-weight: 600;
      min-height: 44px;
      cursor: pointer;
    }
    .checklist__bar {
      height: 8px;
      border-radius: 999px;
      background: var(--well);
      overflow: hidden;
      margin-block-end: var(--space-3);
    }
    .checklist__fill {
      display: block;
      height: 100%;
      background: var(--cta);
    }
    .checklist__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .checklist__row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: var(--tap);
      color: inherit;
      text-decoration: none;
      font-weight: 600;
    }
    .checklist__check {
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 50%;
      border: 2px solid var(--muted);
    }
    .checklist__check--on {
      border-color: var(--cta);
      background: var(--cta);
    }
  `,
})
export class SetupChecklist {
  readonly i18n = inject(I18n);
  readonly items = input.required<ChecklistItem[]>();
  readonly dismiss = output<void>();

  readonly doneCount = computed(() => this.items().filter((i) => i.done).length);
  readonly progressPct = computed(() =>
    this.items().length ? (this.doneCount() / this.items().length) * 100 : 0,
  );
}
