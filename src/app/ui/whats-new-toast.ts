import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n/i18n';
import { PrimaryButton } from './primary-button';

@Component({
  selector: 'app-whats-new-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PrimaryButton],
  templateUrl: './whats-new-toast.html',
  styleUrl: './whats-new-toast.scss',
})
export class WhatsNewToast {
  readonly i18n = inject(I18n);
  readonly version = input('');
  readonly dismissed = output<void>();

  readonly titleId = `wn-toast-${Math.random().toString(36).slice(2, 8)}`;
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
      el?.querySelector('button')?.focus();
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dismissed.emit();
    }
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.dismissed.emit();
  }
}
