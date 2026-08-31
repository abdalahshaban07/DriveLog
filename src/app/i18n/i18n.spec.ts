import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { I18n } from './i18n';
import { Db } from '../data/db';

describe('I18n.formatNumber', () => {
  const dbStub = {
    settings: () => ({
      language: 'en',
      theme: 'dark',
      currency: 'EGP',
      unitSystem: 'metric',
      installBannerDismissed: true,
      remindersEnabled: true,
    }),
    updateSettings: async () => undefined,
  };

  it('formats English with Western digits', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('en');
    expect(i18n.formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe('1,234.5');
  });

  it('formats Arabic with Eastern Arabic digits', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    const formatted = i18n.formatNumber(1234, { maximumFractionDigits: 0 });
    expect(formatted).toMatch(/[\u0660-\u0669]/);
    expect(formatted).not.toMatch(/[0-9]/);
  });
});
