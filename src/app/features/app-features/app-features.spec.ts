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
    expect(el.textContent).toContain('features.assistant.title');
    expect(el.textContent).toContain('features.health.body');
    expect(el.textContent).toContain('features.budget.title');
  });

  it('lists zero-key Smart Advisor and does not claim BYOK for health or budget', () => {
    expect(en['features.assistant.body'].toLowerCase()).toMatch(/no api key/);
    expect(en['features.assistant.body'].toLowerCase()).not.toMatch(
      /your own api key|with your api key|bring your own/,
    );
    expect(ar['features.assistant.title']).toBeTruthy();
    expect(ar['features.assistant.body']).toBeTruthy();
    expect(en['features.health.body'].toLowerCase()).not.toMatch(
      /your own api key|with your api key|cloud llm/,
    );
    expect(en['features.budget.body'].toLowerCase()).not.toMatch(
      /your own api key|with your api key|cloud llm/,
    );
    expect(ar['features.budget.body']).toBeTruthy();
    expect(en['features.exportPdf.title']).toBeTruthy();
    expect(ar['features.exportPdf.title']).toBeTruthy();
  });
});
