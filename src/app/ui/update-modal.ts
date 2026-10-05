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
import type { WhatsNewCard } from '../pwa/whats-new';
import { PrimaryButton } from './primary-button';

@Component({
  selector: 'app-update-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PrimaryButton],
  templateUrl: './update-modal.html',
  styleUrl: './update-modal.scss',
})
export class UpdateModal {
  readonly i18n = inject(I18n);

  readonly title = input('');
  readonly lines = input<string[]>([]);
  readonly cards = input<WhatsNewCard[]>([]);
  readonly releaseId = input('');
  readonly isUpdate = input(true);
  readonly later = output<void>();
  readonly updateNow = output<void>();

  readonly titleId = `update-modal-${Math.random().toString(36).slice(2, 8)}`;
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
      const focusTarget =
        el?.querySelector<HTMLElement>('.update-sheet__actions button') ??
        el?.querySelector<HTMLElement>('button');
      focusTarget?.focus();
    });
  }

  ledgerIndex(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.later.emit();
    }
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.later.emit();
  }
}
