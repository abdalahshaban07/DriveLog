import { Injectable, computed, effect, signal } from '@angular/core';
import { Db } from '../data/db';
import type { Theme } from '../domain/models';
import { ar } from './ar';
import { en, type MsgKey } from './en';

function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function resolveTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return theme;
}

function themeChrome(resolved: Exclude<Theme, 'system'>): {
  colorScheme: 'light' | 'dark';
  color: string;
} {
  switch (resolved) {
    case 'light':
      return { colorScheme: 'light', color: '#e8ecf1' };
    case 'dark':
      return { colorScheme: 'dark', color: '#0b0d10' };
    case 'contrast':
      return { colorScheme: 'dark', color: '#000000' };
    case 'dusk':
      return { colorScheme: 'dark', color: '#141820' };
    default: {
      const _never: never = resolved;
      return _never;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly lang = signal<'en' | 'ar'>('ar');
  private readonly systemDark = signal(systemPrefersDark());

  readonly language = this.lang.asReadonly();
  readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));

  constructor(private readonly db: Db) {
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.systemDark.set(e.matches);
    });
    effect(() => {
      const settings = this.db.settings();
      this.lang.set(settings.language);
    });
    effect(() => {
      const pref = this.db.settings().theme;
      this.systemDark();
      const resolved = resolveTheme(pref);
      const dir = this.dir();
      const chrome = themeChrome(resolved);
      const root = document.documentElement;
      root.dir = dir;
      root.lang = this.lang();
      root.dataset['theme'] = pref === 'system' ? 'system' : resolved;
      if (pref === 'system') {
        root.dataset['resolvedTheme'] = resolved;
      } else {
        delete root.dataset['resolvedTheme'];
      }
      root.style.colorScheme = chrome.colorScheme;
      document.title = this.t('app.name');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome.color);
    });
  }

  t(key: MsgKey, params?: Record<string, string | number>): string {
    const table = this.lang() === 'ar' ? ar : en;
    let text: string = table[key] ?? en[key] ?? key;
    const resolved = params ? this.formatParams(params) : undefined;
    if (resolved) {
      for (const [k, v] of Object.entries(resolved)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  formatUnit(value: number, unitKey: MsgKey, fractionDigits?: number): string {
    const options: Intl.NumberFormatOptions = {};
    if (fractionDigits != null) {
      options.minimumFractionDigits = fractionDigits;
      options.maximumFractionDigits = fractionDigits;
    }
    const num = this.formatNumber(value, options);
    const unit = this.t(unitKey);
    if (unitKey === 'common.perLiter') {
      return `${num}${unit}`;
    }
    return `${num} ${unit}`;
  }

  private formatParams(params: Record<string, string | number>): Record<string, string | number> {
    const out = { ...params };
    if (typeof out['l100'] === 'number') {
      out['l100'] = this.formatUnit(out['l100'], 'common.lPer100', 1);
    }
    return out;
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    const locale = this.lang() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB';
    return new Intl.NumberFormat(locale, options).format(value);
  }

  formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
    const locale = this.lang() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB';
    const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value;
    return new Intl.DateTimeFormat(locale, options).format(date);
  }

  async setLanguage(language: 'en' | 'ar'): Promise<void> {
    this.lang.set(language);
    await this.db.updateSettings({ language });
  }
}
