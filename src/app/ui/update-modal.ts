import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n/i18n';
import { PrimaryButton } from './primary-button';
import { MotionPolicy } from './motion/motion-policy';
import { createAnimeScope } from './motion/anime-scope';

@Component({
  selector: 'app-update-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PrimaryButton],
  templateUrl: './update-modal.html',
  styleUrl: './update-modal.scss',
})
export class UpdateModal {
  readonly i18n = inject(I18n);
  private readonly destroyRef = inject(DestroyRef);
  private readonly policy = inject(MotionPolicy);

  readonly lines = input<string[]>([]);
  readonly releaseId = input('');
  readonly later = output<void>();
  readonly updateNow = output<void>();

  readonly titleId = `update-modal-${Math.random().toString(36).slice(2, 8)}`;
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cards = viewChild<ElementRef<HTMLElement>>('cards');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
      el?.querySelector('button')?.focus();
      void this.staggerCards();
    });
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

  private async staggerCards(): Promise<void> {
    const root = this.cards()?.nativeElement;
    if (!root) {
      return;
    }
    const scope = await createAnimeScope(root, this.destroyRef, this.policy, 'updateModal');
    if (!scope) {
      return;
    }
    try {
      const { animate, stagger } = await import('animejs');
      scope.add('stagger', () => {
        animate(root.querySelectorAll('.update-card'), {
          opacity: [0, 1],
          translateY: [10, 0],
          delay: stagger(70),
          duration: 420,
          ease: 'out(3)',
        });
      });
      scope.methods['stagger']();
    } catch {
      /* CSS fallback */
    }
  }
}
