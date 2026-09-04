import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n/i18n';
import type { WhatsNewCard, WhatsNewIcon } from '../pwa/whats-new';
import { PrimaryButton } from './primary-button';
import { MotionPolicy } from './motion/motion-policy';
import { createAnimeScope } from './motion/anime-scope';

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly policy = inject(MotionPolicy);

  readonly title = input('');
  readonly lines = input<string[]>([]);
  readonly cards = input<WhatsNewCard[]>([]);
  readonly releaseId = input('');
  readonly isUpdate = input(true);
  readonly later = output<void>();
  readonly updateNow = output<void>();

  readonly titleId = `update-modal-${Math.random().toString(36).slice(2, 8)}`;
  readonly activeDot = signal(0);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cardsEl = viewChild<ElementRef<HTMLElement>>('cardsEl');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
      el?.querySelector('button')?.focus();
      void this.staggerCards();
      this.bindRailScroll();
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

  onRailScroll(): void {
    const root = this.cardsEl()?.nativeElement;
    if (!root || root.children.length === 0) {
      return;
    }
    const first = root.children[0] as HTMLElement;
    const step = first.offsetWidth + 12;
    if (step <= 0) {
      return;
    }
    this.activeDot.set(Math.round(Math.abs(root.scrollLeft) / step));
  }

  goToCard(index: number): void {
    const root = this.cardsEl()?.nativeElement;
    const child = root?.children[index] as HTMLElement | undefined;
    child?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
    this.activeDot.set(index);
  }

  private bindRailScroll(): void {
    const root = this.cardsEl()?.nativeElement;
    if (!root) {
      return;
    }
    const onScroll = () => this.onRailScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => root.removeEventListener('scroll', onScroll));
  }

  private async staggerCards(): Promise<void> {
    const root = this.cardsEl()?.nativeElement;
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
