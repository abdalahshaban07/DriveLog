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

  it('formats Arabic with Eastern Arabic digits and Western thousands comma', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    const whole = i18n.formatNumber(1234, { maximumFractionDigits: 0 });
    expect(whole).toMatch(/[\u0660-\u0669]/);
    expect(whole).not.toMatch(/[0-9]/);
    expect(whole).toContain(',');
    expect(whole).not.toMatch(/[،٬]/);

    const decimal = i18n.formatNumber(1234.5, { maximumFractionDigits: 1 });
    expect(decimal).toMatch(/[\u0660-\u0669]/);
    expect(decimal).toContain(',');
    expect(decimal).not.toMatch(/[،٬]/);
  });
});

describe('I18n.formatMoney', () => {
  it('formats Arabic money with Eastern digits and Western thousands comma', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    const formatted = i18n.formatMoney(1234.5, 'EGP', 2);
    expect(formatted).toMatch(/[\u0660-\u0669]/);
    expect(formatted).not.toMatch(/[0-9]/);
    expect(formatted).toContain(',');
    expect(formatted).not.toMatch(/[،٬]/);
  });
});

describe('I18n.formatDate', () => {
  it('formats Arabic ISO dates with Eastern Arabic digits', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    const formatted = i18n.formatDate('2026-03-15');
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
    expect(formatted).toContain('ل/١٠٠ كم');
    expect(formatted).not.toMatch(/[0-9]/);
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

  it('formats numeric and ISO date params with Eastern digits in Arabic', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    const withPct = i18n.t('reports.biggest.fuel', { pct: 52 });
    expect(withPct).toMatch(/[\u0660-\u0669]/);
    expect(withPct).not.toMatch(/[0-9]/);
    const withDate = i18n.t('home.period.since', { date: '2026-03-15' });
    expect(withDate).toMatch(/[\u0660-\u0669]/);
    expect(withDate).not.toMatch(/[0-9]/);
  });
});

describe('I18n Arabic static copy', () => {
  it('uses Eastern digits in fuel grade and L/100 labels', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Db, useValue: dbStub }, I18n],
    });
    const i18n = TestBed.inject(I18n);
    await i18n.setLanguage('ar');
    expect(i18n.t('home.fuel92')).toBe('٩٢');
    expect(i18n.t('home.fuel95')).toBe('٩٥');
    expect(i18n.t('fillUp.grade.gasoline92')).toBe('٩٢');
    expect(i18n.t('common.lPer100')).toBe('ل/١٠٠ كم');
    expect(i18n.t('charts.period30d')).toBe('آخر ٣٠ يوم');
  });
});
