import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { I18n } from '../../i18n/i18n';
import { MorePage, MORE_SECTIONS } from './more';

describe('MorePage', () => {
  it('renders grouped headings and support links without whats new', async () => {
    await TestBed.configureTestingModule({
      imports: [MorePage],
      providers: [
        provideRouter([]),
        {
          provide: I18n,
          useValue: { t: (k: string) => k, language: () => 'en' as const },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MorePage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('more.group.app');
    expect(el.textContent).toContain('more.group.logs');
    expect(el.textContent).toContain('more.group.tools');
    expect(el.textContent).toContain('more.group.support');
    expect(el.textContent).toContain('more.help');
    expect(el.textContent).toContain('more.legal');
    expect(el.textContent).toContain('more.about');
    expect(el.textContent).toContain('more.contact');
    expect(el.textContent).not.toContain('more.whatsNew');
    expect(el.querySelector('a[href="/help"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal"]')).toBeTruthy();
    expect(el.querySelector('a[href="/about"]')).toBeTruthy();
    expect(el.querySelector('a[href="/contact"]')).toBeTruthy();
    expect(MORE_SECTIONS.map((s) => s.headingKey)).toEqual([
      'more.group.app',
      'more.group.logs',
      'more.group.tools',
      'more.group.support',
    ]);
  });
});
