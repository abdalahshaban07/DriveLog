import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { routes } from '../../app.routes';

describe('HomePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter(routes),
        {
          provide: Db,
          useValue: {
            cars: () => [{ id: 'c1', nickname: 'Car', currentOdometer: 1000 }],
            car: () => ({ id: 'c1', nickname: 'Car', currentOdometer: 1000 }),
            settings: () => ({
              language: 'en',
              theme: 'dark',
              currency: 'EGP',
              unitSystem: 'metric',
              installBannerDismissed: true,
              remindersEnabled: true,
              assistantEnabled: false,
            }),
            fillUps: () => [],
            maintenance: () => [],
            breakdowns: () => [],
            otherExpenses: () => [],
            expensePeriods: () => [],
          },
        },
        {
          provide: I18n,
          useValue: {
            t: (k: string) => k,
            formatNumber: (n: number) => String(n),
            formatDate: (d: string) => d,
            language: () => 'en' as const,
          },
        },
      ],
    }).compileComponents();
  });

  it('starts with empty nearby results', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredNearby()).toEqual([]);
  });

  it('builds recommendations and month outlook', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.recommendations().length).toBeGreaterThan(0);
    expect(page.monthOutlook().actual).toBe(0);
    expect(page.monthOutlook().projected).toBeNull();
  });

  it('renders dashboard list-reveal panel', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.home-panel--dashboard.list-reveal');
    expect(panel).toBeTruthy();
  });

  it('does not show AI tip when assistant is disabled', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.componentInstance.assistantOnline()).toBe(false);
    const aiCard = fixture.nativeElement.querySelector('.rec-card--ai');
    expect(aiCard).toBeFalsy();
  });
});
