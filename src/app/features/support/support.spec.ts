import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { I18n } from '../../i18n/i18n';
import { en } from '../../i18n/en';
import { ar } from '../../i18n/ar';
import { parseSupportDoc, SupportPage, type SupportDoc } from './support';

function i18nStub() {
  return {
    t: (k: string, p?: Record<string, string | number>) => {
      if (p?.['version'] != null) {
        return `${k}:${p['version']}`;
      }
      if (p?.['n'] != null) {
        return `${k}:${p['n']}`;
      }
      if (p?.['q'] != null) {
        return `${k}:${p['q']}`;
      }
      return k;
    },
    language: () => 'en' as const,
  };
}

async function render(doc: SupportDoc): Promise<{ el: HTMLElement; cmp: SupportPage }> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [SupportPage],
    providers: [
      provideRouter([
        { path: 'help', component: SupportPage },
        { path: 'legal', component: SupportPage },
        { path: 'about', component: SupportPage },
        { path: 'contact', component: SupportPage },
      ]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { doc } } } },
      { provide: I18n, useValue: i18nStub() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SupportPage);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
}

describe('SupportPage', () => {
  it('shows FAQ details, hint, and support tabs on help', async () => {
    const { el, cmp } = await render('help');
    expect(el.textContent).toContain('help.title');
    expect(el.textContent).toContain('help.hint');
    expect(el.querySelectorAll('details').length).toBeGreaterThan(3);
    expect(el.querySelector('a[href="/legal"]')).toBeTruthy();
    expect(el.querySelector('[role="status"]')).toBeTruthy();

    const first = el.querySelector('details') as HTMLDetailsElement;
    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    expect(cmp.openFaq()).toBe('help.q.data');
  });

  it('shows privacy paper, jump links, and terms headings on legal', async () => {
    const { el } = await render('legal');
    expect(el.textContent).toContain('legal.title');
    expect(el.querySelector('.paper-doc')).toBeTruthy();
    expect(el.querySelector('#legal-privacy')?.textContent).toContain('legal.privacyHeading');
    expect(el.querySelector('#legal-terms')?.textContent).toContain('legal.termsHeading');
    expect(el.querySelector('a[href="#legal-privacy"]')).toBeTruthy();
  });

  it('shows version and support links on about', async () => {
    const { el } = await render('about');
    expect(el.textContent).toContain('about.title');
    expect(el.textContent).toContain('about.version:');
    expect(el.querySelector('a[href="/help"]')).toBeTruthy();
    expect(el.querySelector('a[href="/settings/features"]')).toBeTruthy();
  });

  it('shows contact topic and mailto on contact', async () => {
    const { el, cmp } = await render('contact');
    expect(el.textContent).toContain('contact.title');
    expect(el.textContent).toContain('contact.lead');
    expect(el.textContent).toContain(cmp.contactEmail);
    expect(el.querySelector('a[href="/contact"]')).toBeTruthy();
    expect(cmp.contactMailto()).toContain('mailto:abdalahshaban129@gmail.com');
  });

  it('does not claim a BYOK API key', () => {
    const blob = [
      en['legal.privacy.p1'],
      en['legal.privacy.p2'],
      en['help.a.data'],
      en['about.localFirst'],
    ]
      .join(' ')
      .toLowerCase();
    expect(blob).not.toMatch(/your own api key|with your api key/);
    expect(ar['legal.privacy.p1']).toBeTruthy();
  });

  it('parses unknown docs as about', () => {
    expect(parseSupportDoc('help')).toBe('help');
    expect(parseSupportDoc('contact')).toBe('contact');
    expect(parseSupportDoc('nope')).toBe('about');
  });
});
