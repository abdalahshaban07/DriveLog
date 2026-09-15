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
import type { WhatsNewCard, WhatsNewIcon } from '../pwa/whats-new';
import { PrimaryButton } from './primary-button';

/** Inline 24×24 paths — same stroke style as shell label-row icons */
const ICON_PATHS: Record<WhatsNewIcon, string> = {
  fuel: 'M7 6h6v14H7zm3-2.5h0M15 10h2.5l2 2v5a1.5 1.5 0 0 0 3 0v-5.5L19.5 8.5',
  chart: 'M5 19V9M10 19V5M15 19v-7M20 19V11',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17l3 3 5.1-5.1a4 4 0 0 0 5.6-5.6L15 12l-2.3-2.3z',
  palette: 'M12 4a8 8 0 1 0 0 16h1.5a2 2 0 0 0 0-4H12a4 4 0 1 1 4-4',
  sparkle: 'M12 3l1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2zM18 15l.6 2.4L21 18l-2.4.6L18 21l-.6-2.4L15 18l2.4-.6z',
  bug: 'M9 9V7a3 3 0 0 1 6 0v2M8 13h8M9 17h6M5 11l2 1M19 11l-2 1M5 17l2-1M19 17l-2-1M10 9h4v10a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2z',
};

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

  iconPath(icon: WhatsNewIcon): string {
    return ICON_PATHS[icon] ?? ICON_PATHS.sparkle;
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
