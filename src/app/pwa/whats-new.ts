import { Injectable, computed, inject, signal } from '@angular/core';
import { Db } from '../data/db';
import { I18n } from '../i18n/i18n';

export type WhatsNewIcon = 'fuel' | 'chart' | 'wrench' | 'palette' | 'sparkle' | 'bug';

export type WhatsNewCard = {
  icon: WhatsNewIcon;
  title: string;
  body: string;
};

export type WhatsNewEntry = string | Partial<WhatsNewCard> & { title: string; body: string };

export type WhatsNewFile = {
  id: string;
  en: WhatsNewEntry[];
  ar: WhatsNewEntry[];
};

const ICONS = new Set<WhatsNewIcon>(['fuel', 'chart', 'wrench', 'palette', 'sparkle', 'bug']);

/** ponytail: legacy strings become body-only cards with sparkle icon */
export function normalizeWhatsNewEntry(entry: WhatsNewEntry): WhatsNewCard {
  if (typeof entry === 'string') {
    return { icon: 'sparkle', title: '', body: entry };
  }
  const icon = entry.icon && ICONS.has(entry.icon) ? entry.icon : 'sparkle';
  return {
    icon,
    title: String(entry.title ?? ''),
    body: String(entry.body ?? ''),
  };
}

function normalizeList(entries: WhatsNewEntry[] | undefined, fallback: WhatsNewEntry[]): WhatsNewCard[] {
  const list = Array.isArray(entries) && entries.length ? entries : fallback;
  return list.map(normalizeWhatsNewEntry);
}

@Injectable({ providedIn: 'root' })
export class WhatsNew {
  private readonly db = inject(Db);
  private readonly i18n = inject(I18n);
  private readonly _notes = signal<WhatsNewFile | null>(null);
  private readonly _manualOpen = signal(false);

  readonly notes = this._notes.asReadonly();
  readonly manualOpen = this._manualOpen.asReadonly();

  readonly visible = computed(() => {
    const n = this._notes();
    if (!n?.id || !n.en?.length) {
      return false;
    }
    return n.id !== this.db.settings().lastSeenWhatsNewId;
  });

  readonly cards = computed(() => {
    const n = this._notes();
    if (!n) {
      return [];
    }
    const lang = this.i18n.language();
    return lang === 'ar' ? normalizeList(n.ar, n.en) : normalizeList(n.en, n.ar);
  });

  /** @deprecated use cards */
  readonly lines = computed(() =>
    this.cards().map((c) => (c.title ? `${c.title}: ${c.body}` : c.body)),
  );

  readonly summary = computed(() => {
    const first = this.cards()[0];
    return first ? (first.title || first.body) : '';
  });

  readonly sheetOpen = computed(() => this._manualOpen() || this.visible());

  async load(): Promise<void> {
    try {
      const res = await fetch('whats-new.json', { cache: 'no-cache' });
      if (!res.ok) {
        return;
      }
      const raw = (await res.json()) as WhatsNewFile;
      if (!raw?.id || !Array.isArray(raw.en) || !raw.en.length) {
        return;
      }
      this._notes.set({
        id: String(raw.id),
        en: raw.en,
        ar: Array.isArray(raw.ar) ? raw.ar : raw.en,
      });
    } catch {
      /* offline / missing file */
    }
  }

  openManual(): void {
    void this.load().then(() => {
      if (this.cards().length) {
        this._manualOpen.set(true);
      }
    });
  }

  closeManual(): void {
    this._manualOpen.set(false);
  }

  async dismiss(): Promise<void> {
    const id = this._notes()?.id;
    if (!id) {
      return;
    }
    this._manualOpen.set(false);
    await this.db.updateSettings({ lastSeenWhatsNewId: id });
  }
}
