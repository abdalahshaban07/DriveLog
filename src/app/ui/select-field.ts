import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

export type SelectOption = { value: string; label: string };

@Component({
  selector: 'app-select-field',
  templateUrl: './select-field.html',
  styleUrl: './select-field.scss',
  host: {
    '(keydown)': 'onKey($event)',
  },
})
export class SelectField {
  readonly label = input.required<string>();
  readonly value = model.required<string>();
  readonly options = input.required<readonly SelectOption[]>();

  readonly opened = signal(false);
  readonly active = signal(0);

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly uid = crypto.randomUUID().slice(0, 8);
  private typed = '';
  private typedAt = 0;

  readonly labelId = `sel-l-${this.uid}`;
  readonly listId = `sel-m-${this.uid}`;

  readonly currentLabel = computed(() => {
    const v = this.value();
    return this.options().find((o) => o.value === v)?.label ?? v;
  });

  private readonly scrollActive = afterRenderEffect(() => {
    if (!this.opened()) {
      return;
    }
    const node = this.el.nativeElement.querySelector(
      `#${this.optionId(this.active())}`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  });

  optionId(index: number): string {
    return `sel-o-${this.uid}-${index}`;
  }

  toggle(): void {
    if (this.opened()) {
      this.close();
      return;
    }
    this.open();
  }

  open(): void {
    const i = this.options().findIndex((o) => o.value === this.value());
    this.active.set(i < 0 ? 0 : i);
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
  }

  choose(value: string): void {
    this.value.set(value);
    this.close();
  }

  onKey(event: KeyboardEvent): void {
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!this.opened()) {
        this.open();
      }
      this.typeahead(event.key);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.opened()) {
          this.open();
          return;
        }
        this.move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.opened()) {
          this.open();
          return;
        }
        this.move(-1);
        return;
      case 'Home':
        if (!this.opened()) {
          return;
        }
        event.preventDefault();
        this.active.set(0);
        return;
      case 'End': {
        if (!this.opened()) {
          return;
        }
        event.preventDefault();
        const last = this.options().length - 1;
        this.active.set(last < 0 ? 0 : last);
        return;
      }
      case 'Enter':
      case ' ':
        if (!this.opened()) {
          return;
        }
        event.preventDefault();
        this.choose(this.options()[this.active()]?.value ?? this.value());
        return;
      case 'Escape':
        if (!this.opened()) {
          return;
        }
        event.preventDefault();
        this.close();
        return;
      default:
        return;
    }
  }

  private move(delta: number): void {
    const n = this.options().length;
    if (n === 0) {
      return;
    }
    this.active.set(Math.min(n - 1, Math.max(0, this.active() + delta)));
  }

  private typeahead(ch: string): void {
    const now = Date.now();
    this.typed = now - this.typedAt < 500 ? this.typed + ch : ch;
    this.typedAt = now;
    const q = this.typed.toLowerCase();
    const i = this.options().findIndex(
      (o) =>
        o.label.toLowerCase().startsWith(q) || o.value.toLowerCase().startsWith(q),
    );
    if (i >= 0) {
      this.active.set(i);
    }
  }
}
