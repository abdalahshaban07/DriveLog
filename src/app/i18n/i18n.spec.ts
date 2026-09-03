import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { I18n } from './i18n';
import { Db } from '../data/db';

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

describe('I18n.formatNumber', () => {
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

describe('I18n.formatUnit', () => {
  it('formats English value with unit label', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('en');
    expect(i18n.formatUnit(9.2, 'common.lPer100', 1)).toBe('9.2 L/100 km');
    expect(i18n.formatUnit(12.5, 'common.perLiter', 2)).toBe('12.50/L');
  });

  it('formats Arabic with Eastern Arabic digits and localized unit', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    const formatted = i18n.formatUnit(9.2, 'common.lPer100', 1);
    expect(formatted).toMatch(/[\u0660-\u0669]/);
    expect(formatted).toMatch(/٩/);
    expect(formatted).toContain('ل/100 كم');
  });

  it('formats l100 param in t() via formatUnit', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('en');
    expect(i18n.t('assistant.local.economy', { l100: 9.2 })).toBe(
      'Your latest full-tank segment is 9.2 L/100 km.',
    );
  });
});
