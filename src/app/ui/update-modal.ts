import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n/i18n';

@Component({
  selector: 'app-update-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="later.emit()" aria-hidden="true"></div>
    <div
      #dialog
      class="modal"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
    >
      <h2 [id]="titleId" class="modal__title">{{ i18n.t('update.available') }}</h2>
      @if (lines().length) {
        <ul class="modal__list">
          @for (line of lines(); track line) {
            <li>{{ line }}</li>
          }
        </ul>
      } @else {
        <p class="modal__body">{{ i18n.t('update.notifyBody') }}</p>
      }
      <div class="modal__actions">
        <button type="button" class="modal__later" (click)="later.emit()">
          {{ i18n.t('update.later') }}
        </button>
        <button type="button" class="modal__now" (click)="updateNow.emit()">
          {{ i18n.t('update.reload') }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: grid;
      place-items: center;
      padding: var(--space-5);
    }
    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--bg) 55%, #000 45%);
    }
    .modal {
      position: relative;
      width: min(100%, 22rem);
      padding: var(--space-5);
      border-radius: var(--radius);
      background: var(--surface);
      border: 1px solid var(--hairline);
      box-shadow: var(--shadow-soft);
      animation: modal-in var(--motion-normal) var(--ease-out);
    }
    @keyframes modal-in {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    .modal__title {
      margin: 0 0 var(--space-3);
      font-size: var(--type-title);
      font-weight: 700;
    }
    .modal__body,
    .modal__list {
      margin: 0 0 var(--space-4);
      color: var(--text);
      font-size: 0.95rem;
    }
    .modal__list {
      padding-inline-start: 1.1rem;
    }
    .modal__actions {
      display: flex;
      gap: var(--space-2);
      justify-content: flex-end;
    }
    .modal__later,
    .modal__now {
      min-height: 44px;
      padding: 0 var(--space-4);
      border: 0;
      border-radius: var(--radius);
      font-weight: 700;
      cursor: pointer;
    }
    .modal__later {
      background: var(--well);
      color: var(--text);
    }
    .modal__now {
      background: var(--fuel);
      color: var(--cta-text);
    }
    @media (prefers-reduced-motion: reduce) {
      .modal {
        animation: none;
      }
    }
  `,
})
export class UpdateModal {
  readonly i18n = inject(I18n);
  readonly lines = input<string[]>([]);
  readonly later = output<void>();
  readonly updateNow = output<void>();
  readonly titleId = `update-modal-${Math.random().toString(36).slice(2, 8)}`;
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.later.emit();
  }

  constructor() {
    queueMicrotask(() => {
      this.dialog()?.nativeElement.querySelector('button')?.focus();
    });
  }
}
