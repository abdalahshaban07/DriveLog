import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { MorePage, MORE_SECTIONS, moreIconPaths } from './more';

const i18nStub = {
  t: (k: string) => k,
  language: () => 'en' as const,
  formatNumber: (n: number) => String(n),
};

describe('MorePage', () => {
  it('renders grouped headings, hints, and support links without whats new', async () => {
    await TestBed.configureTestingModule({
      imports: [MorePage],
      providers: [
        provideRouter([]),
        { provide: I18n, useValue: i18nStub },
        { provide: Db, useValue: { car: () => null } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MorePage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('more.lead');
    expect(el.textContent).toContain('more.group.app');
    expect(el.textContent).toContain('more.group.logs');
    expect(el.textContent).toContain('more.group.tools');
    expect(el.textContent).toContain('more.group.support');
    expect(el.textContent).toContain('more.help');
    expect(el.textContent).toContain('more.help.hint');
    expect(el.textContent).toContain('more.contact');
    expect(el.textContent).not.toContain('more.whatsNew');
    expect(el.querySelector('a[href="/help"]')).toBeTruthy();
    expect(el.querySelector('a[href="/contact"]')).toBeTruthy();
    expect(el.querySelector('a[href="/history/fill-ups"]')).toBeNull();
    expect(el.querySelectorAll('a.line').length).toBe(11);
    expect(el.querySelectorAll('.mark svg').length).toBe(11);
    expect(el.querySelector('.line--feature')).toBeTruthy();
    expect(el.querySelector('.panel--duo')).toBeTruthy();
    expect(el.querySelector('.car-chip')).toBeNull();
    expect(MORE_SECTIONS.map((s) => s.headingKey)).toEqual([
      'more.group.app',
      'more.group.logs',
      'more.group.tools',
      'more.group.support',
    ]);
    for (const section of MORE_SECTIONS) {
      for (const item of section.items) {
        expect(moreIconPaths(item.icon).length).toBeGreaterThan(0);
      }
    }
  });

  it('shows the active car as a chip', async () => {
    await TestBed.configureTestingModule({
      imports: [MorePage],
      providers: [
        provideRouter([]),
        { provide: I18n, useValue: i18nStub },
        {
          provide: Db,
          useValue: { car: () => ({ nickname: 'Corolla', plate: 'ABC 123' }) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MorePage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.car-chip')?.textContent).toContain('Corolla · ABC 123');
  });
});
