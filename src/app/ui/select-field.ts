import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

export type SelectOption = { value: string; label: string };

type MenuBox = {
  top: string;
  bottom: string;
  left: string;
  width: string;
  maxHeight: string;
};

@Component({
  selector: 'app-select-field',
  templateUrl: './select-field.html',
  styleUrl: './select-field.scss',
  host: {
    '(keydown)': 'onKey($event)',
    '[class.compact]': 'compact()',
    '[class.open]': 'opened()',
  },
})
export class SelectField {
  readonly label = input.required<string>();
  readonly value = model.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  readonly compact = input(false);

  readonly opened = signal(false);
  readonly active = signal(0);
  /** Viewport box for body-ported menu. */
  readonly menuBox = signal<MenuBox>({
    top: '0',
    bottom: 'auto',
    left: '0',
    width: '0',
    maxHeight: '20rem',
  });

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  /** Public for template portal attribute. */
  readonly uid = crypto.randomUUID().slice(0, 8);
  private typed = '';
  private typedAt = 0;
  private unbindPlace: (() => void) | null = null;

  readonly labelId = `sel-l-${this.uid}`;
  readonly listId = `sel-m-${this.uid}`;

  readonly currentLabel = computed(() => {
    const v = this.value();
    return this.options().find((o) => o.value === v)?.label ?? v;
  });

  /** Move scrim/menu to <body> so card backdrop-filter / .main overflow cannot trap z-index. */
  private readonly portalEffect = afterRenderEffect(() => {
    if (!this.opened()) {
      return;
    }
    this.mountPortal();
    this.placeMenu();
    const node = document.getElementById(this.optionId(this.active()));
    node?.scrollIntoView({ block: 'nearest' });
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopPlaceListeners();
      this.unmountPortal();
    });
  }

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
    this.startPlaceListeners();
  }

  close(): void {
    this.opened.set(false);
    this.stopPlaceListeners();
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

  private mountPortal(): void {
    const root = this.el.nativeElement as HTMLElement;
    const scrim = root.querySelector('.scrim');
    const menu = root.querySelector('.menu');
    if (scrim && scrim.parentElement !== document.body) {
      document.body.appendChild(scrim);
    }
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
  }

  private unmountPortal(): void {
    document.querySelectorAll(`[data-select-portal="${this.uid}"]`).forEach((n) => n.remove());
  }

  private placeMenu(): void {
    const trigger = this.el.nativeElement.querySelector(
      '.select',
    ) as HTMLElement | null;
    if (!trigger) {
      return;
    }
    const r = trigger.getBoundingClientRect();
    const gap = 6;
    const nav = 88;
    const spaceBelow = window.innerHeight - r.bottom - gap - nav;
    const spaceAbove = r.top - gap - 8;
    // Prefer down; flip only when below can't fit ~3 rows
    const openUp = spaceBelow < 10 * 16 && spaceAbove > spaceBelow;
    const avail = Math.max(8 * 16, openUp ? spaceAbove : spaceBelow);
    const maxH = Math.min(20 * 16, window.innerHeight * 0.5, avail);

    if (openUp) {
      this.menuBox.set({
        top: 'auto',
        bottom: `${window.innerHeight - r.top + gap}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        maxHeight: `${maxH}px`,
      });
      return;
    }
    this.menuBox.set({
      top: `${r.bottom + gap}px`,
      bottom: 'auto',
      left: `${r.left}px`,
      width: `${r.width}px`,
      maxHeight: `${maxH}px`,
    });
  }

  private startPlaceListeners(): void {
    this.stopPlaceListeners();
    const on = (): void => {
      if (!this.opened()) {
        return;
      }
      this.placeMenu();
    };
    window.addEventListener('resize', on);
    document.addEventListener('scroll', on, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', on);
    vv?.addEventListener('scroll', on);
    this.unbindPlace = () => {
      window.removeEventListener('resize', on);
      document.removeEventListener('scroll', on, true);
      vv?.removeEventListener('resize', on);
      vv?.removeEventListener('scroll', on);
    };
  }

  private stopPlaceListeners(): void {
    this.unbindPlace?.();
    this.unbindPlace = null;
  }
}
