import { Injectable, computed, inject, signal } from '@angular/core';
import { Db } from '../data/db';
import { I18n } from '../i18n/i18n';

export type WhatsNewFile = {
  id: string;
  en: string[];
  ar: string[];
};

@Injectable({ providedIn: 'root' })
export class WhatsNew {
  private readonly db = inject(Db);
  private readonly i18n = inject(I18n);
  private readonly _notes = signal<WhatsNewFile | null>(null);

  readonly notes = this._notes.asReadonly();
  readonly visible = computed(() => {
    const n = this._notes();
    if (!n?.id || !n.en?.length) {
      return false;
    }
    return n.id !== this.db.settings().lastSeenWhatsNewId;
  });
  readonly lines = computed(() => {
    const n = this._notes();
    if (!n) {
      return [];
    }
    return this.i18n.language() === 'ar' ? n.ar : n.en;
  });
  readonly summary = computed(() => this.lines()[0] ?? '');

  async load(): Promise<void> {
    try {
      const res = await fetch('whats-new.json', { cache: 'no-cache' });
      if (!res.ok) {
        return;
      }
      const raw = (await res.json()) as WhatsNewFile;
      if (!raw?.id || !Array.isArray(raw.en)) {
        return;
      }
      this._notes.set({
        id: String(raw.id),
        en: raw.en.map(String),
        ar: Array.isArray(raw.ar) ? raw.ar.map(String) : raw.en.map(String),
      });
    } catch {
      /* offline / missing file */
    }
  }

  async dismiss(): Promise<void> {
    const id = this._notes()?.id;
    if (!id) {
      return;
    }
    await this.db.updateSettings({ lastSeenWhatsNewId: id });
  }
}
