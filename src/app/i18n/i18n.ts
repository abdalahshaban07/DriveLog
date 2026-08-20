import { Injectable, computed, effect, signal } from '@angular/core';
import { Db } from '../data/db';
import type { Theme } from '../domain/models';
import { ar } from './ar';
import { en, type MsgKey } from './en';

function themeChrome(theme: Theme): {
  colorScheme: 'light' | 'dark';
  color: string;
} {
  switch (theme) {
    case 'light':
      return { colorScheme: 'light', color: '#e8ecf1' };
    case 'dark':
      return { colorScheme: 'dark', color: '#0b0d10' };
    case 'contrast':
      return { colorScheme: 'dark', color: '#000000' };
    case 'dusk':
      return { colorScheme: 'dark', color: '#141820' };
    default: {
      const _never: never = theme;
      return _never;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly lang = signal<'en' | 'ar'>('ar');

  readonly language = this.lang.asReadonly();
  readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));

  constructor(private readonly db: Db) {
    effect(() => {
      const settings = this.db.settings();
      this.lang.set(settings.language);
    });
    effect(() => {
      const dir = this.dir();
      const theme = this.db.settings().theme;
      const chrome = themeChrome(theme);
      const root = document.documentElement;
      root.dir = dir;
      root.lang = this.lang();
      root.dataset['theme'] = theme;
      root.style.colorScheme = chrome.colorScheme;
      document.title = this.t('app.name');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome.color);
    });
  }

  t(key: MsgKey, params?: Record<string, string | number>): string {
    const table = this.lang() === 'ar' ? ar : en;
    let text: string = table[key] ?? en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  async setLanguage(language: 'en' | 'ar'): Promise<void> {
    this.lang.set(language);
    await this.db.updateSettings({ language });
  }
}
