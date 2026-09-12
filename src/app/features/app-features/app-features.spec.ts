import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppFeaturesPage, FEATURE_CATALOG } from './app-features';
import { I18n } from '../../i18n/i18n';
import { en } from '../../i18n/en';
import { ar } from '../../i18n/ar';

describe('AppFeaturesPage', () => {
  it('lists shipped features including PDF export', async () => {
    await TestBed.configureTestingModule({
      imports: [AppFeaturesPage],
      providers: [
        provideRouter([]),
        {
          provide: I18n,
          useValue: { t: (k: string) => k, language: () => 'en' as const },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppFeaturesPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(FEATURE_CATALOG.length).toBe(4);
    expect(fixture.componentInstance.items.length).toBeGreaterThan(8);
    expect(el.textContent).toContain('features.home.title');
    expect(el.textContent).toContain('features.exportPdf.title');
    expect(el.textContent).toContain('features.assistant.body');
  });

  it('does not claim a BYOK API key for the coach', () => {
    expect(en['features.assistant.body'].toLowerCase()).not.toMatch(
      /your own api key|with your api key/,
    );
    expect(ar['features.assistant.body']).not.toMatch(/مفتاح\s*api\s*بتاعك/);
    expect(en['features.exportPdf.title']).toBeTruthy();
    expect(ar['features.exportPdf.title']).toBeTruthy();
  });
});
