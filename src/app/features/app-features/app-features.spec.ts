import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppFeaturesPage } from './app-features';
import { I18n } from '../../i18n/i18n';

describe('AppFeaturesPage', () => {
  it('lists shipped features', async () => {
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
    expect(fixture.componentInstance.items.length).toBeGreaterThan(8);
    expect(el.textContent).toContain('features.home.title');
    expect(el.textContent).toContain('features.around.body');
  });
});
