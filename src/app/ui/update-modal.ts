import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n/i18n';
import type { WhatsNewCard, WhatsNewIcon } from '../pwa/whats-new';
import { PrimaryButton } from './primary-button';

const NOTE_ICONS: Record<WhatsNewIcon, readonly string[]> = {
  fuel: ['M12 3.2c2.6 3.4 4.4 5.6 4.4 8.2a4.4 4.4 0 0 1-8.8 0c0-2.6 1.8-4.8 4.4-8.2z'],
  chart: ['M4 19.5h16', 'M7 16.5v-5', 'M12 16.5V7', 'M17 16.5v-3'],
  wrench: [
    'M14.7 6.3a4.2 4.2 0 0 0-5.6 5.4L4.2 16.6l3.2 3.2 4.9-4.9a4.2 4.2 0 0 0 5.4-5.6L15 12l-3-3 2.7-2.7z',
  ],
  palette: [
    'M12 3.5a8.5 8.5 0 1 0 0 17h1.4a2.4 2.4 0 0 0 0-4.8H12a1.8 1.8 0 0 1 0-3.6h.5A4.6 4.6 0 0 0 12 3.5z',
  ],
  sparkle: ['M12 2.8 13.4 8 18.6 9.4 13.4 10.8 12 16l-1.4-5.2L5.4 9.4 10.6 8z'],
  bug: [
    'M8 10a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0z',
    'M4.5 12h3',
    'M16.5 12h3',
    'M7 17.5 9 16',
    'M17 17.5 15 16',
    'M8.5 8 6.5 5.5',
    'M15.5 8l2-2.5',
  ],
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

  /** One note is a card. Several notes are a short list. The update prompt shows neither. */
  readonly solo = computed(() => {
    const cards = this.cards();
    return !this.isUpdate() && cards.length === 1 ? cards[0] : undefined;
  });

  readonly many = computed(() => !this.isUpdate() && this.cards().length > 1);

  readonly heading = computed(() => {
    const only = this.solo();
    if (only?.title) {
      return only.title;
    }
    return this.title() || this.i18n.t(this.isUpdate() ? 'update.available' : 'update.whatsNew');
  });

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

  iconPaths(icon: WhatsNewIcon): readonly string[] {
    return NOTE_ICONS[icon];
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
