import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { SectionTabs, type SectionTab } from './section-tabs';

const dbStub = {
  settings: () => ({
    language: 'en' as const,
    theme: 'dark' as const,
    currency: 'EGP',
    unitSystem: 'metric' as const,
    installBannerDismissed: true,
    remindersEnabled: true,
  }),
  updateSettings: async () => undefined,
};

describe('SectionTabs', () => {
  it('renders router links for each tab', async () => {
    await TestBed.configureTestingModule({
      imports: [SectionTabs],
      providers: [provideRouter([]), { provide: Db, useValue: dbStub }, I18n],
    }).compileComponents();

    const i18n = TestBed.inject(I18n);
    const fixture = TestBed.createComponent(SectionTabs);
    const tabs: SectionTab[] = [
      { labelKey: 'fillUp.title', link: '/fill-up' },
      { labelKey: 'section.history', link: '/history/fill-ups' },
    ];
    fixture.componentRef.setInput('tabs', tabs);
    fixture.componentRef.setInput('ariaLabel', 'Sections');
    fixture.detectChanges();

    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('href')).toContain('/fill-up');
    expect(links[1]?.getAttribute('href')).toContain('/history/fill-ups');
    expect(links[0]?.textContent?.trim()).toBe(i18n.t('fillUp.title'));
    expect(links[1]?.textContent?.trim()).toBe(i18n.t('section.history'));
  });
});
