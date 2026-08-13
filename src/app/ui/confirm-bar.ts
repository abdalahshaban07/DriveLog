import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-confirm-bar',
  templateUrl: './confirm-bar.html',
  styleUrl: './confirm-bar.scss',
  host: {
    '[class.modal]': 'modal()',
    '(document:keydown.escape)': 'onEsc($event)',
  },
})
export class ConfirmBar {
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly secondaryLabel = input('');
  readonly destructive = input(true);
  readonly modal = input(false);
  readonly confirmed = output<void>();
  readonly secondary = output<void>();
  readonly cancelled = output<void>();

  readonly msgId = `cfm-${crypto.randomUUID().slice(0, 8)}`;

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly restore =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // ponytail: no focus trap; Tab can leave. CDK Dialog if audit requires it.
  private readonly primed = afterNextRender(() => {
    if (!this.modal()) {
      return;
    }
    const panel = this.el.nativeElement.querySelector('[role="dialog"]');
    if (panel instanceof HTMLElement) {
      panel.focus();
    }
  });

  private readonly unhook = inject(DestroyRef).onDestroy(() => {
    if (this.modal()) {
      this.restore?.focus();
    }
  });

  onEsc(event: Event): void {
    if (!this.modal()) {
      return;
    }
    event.preventDefault();
    this.cancelled.emit();
  }
}
