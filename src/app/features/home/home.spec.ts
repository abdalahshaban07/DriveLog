import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { InstallPwa } from '../../pwa/install-pwa';
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
            cars: () => [
              {
                id: 'c1',
                nickname: 'Car',
                currentOdometer: 1000,
                initialOdometer: 0,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            car: () => ({
              id: 'c1',
              nickname: 'Car',
              currentOdometer: 1000,
              initialOdometer: 0,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
            settings: () => ({
              language: 'en',
              theme: 'dark',
              look: 'receipt',
              currency: 'EGP',
              unitSystem: 'metric',
              installBannerDismissed: true,
              remindersEnabled: true,
            }),
            fillUps: () => [],
            maintenance: () => [],
            breakdowns: () => [],
            otherExpenses: () => [],
            expensePeriods: () => [],
            catalog: () => [],
            parts: () => [],
            partOverrides: () => [],
            healthNotificationState: () => [],
            snapshotCurrency: () => 'EGP',
          },
        },
        {
          provide: InstallPwa,
          useValue: {
            canPrompt: () => false,
            installed: () => false,
            promptInstall: async () => undefined,
          },
        },
        {
          provide: I18n,
          useValue: {
            t: (k: string) => k,
            formatNumber: (n: number) => String(n),
            formatUnit: (n: number) => String(n),
            formatDate: (d: string) => d,
            formatMoney: (n: number) => String(n),
            language: () => 'en' as const,
            dir: () => 'ltr' as const,
          },
        },
      ],
    }).compileComponents();
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

  it('shows local Smart Advisor card without remote AI gate', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const advisor = fixture.nativeElement.querySelector('.advisor-card');
    expect(advisor).toBeTruthy();
  });
});
