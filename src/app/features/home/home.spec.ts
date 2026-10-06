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
            vehicleDocuments: () => [],
            preTripChecks: () => [],
            chargeSessions: () => [],
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

  it('builds month outlook and stays quiet when nothing is due', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.attention()).toEqual([]);
    expect(page.monthOutlook().actual).toBe(0);
    expect(page.monthOutlook().previous).toBe(0);
    expect(page.monthOutlook().projected).toBeNull();
    expect(page.monthVsLast()).toBeNull();
    expect(page.monthPace(10, 31)).toBe(32);
    expect(page.monthPace(0, 0)).toBe(0);
    expect(page.headerLine()).toBe('Car · 1000 common.km');
    expect(page.paperLines(page.db.car()!).map((paper) => paper.tone)).toEqual(['plain', 'plain']);
    const flagged = page.paperLines({
      ...page.db.car()!,
      licenseExpiry: '2000-01-01',
      registrationExpiry: '2099-01-01',
    });
    expect(flagged.map((paper) => paper.tone)).toEqual(['overdue', 'plain']);
  });

  it('renders dashboard list-reveal panel', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.home-panel--dashboard.list-reveal');
    expect(panel).toBeTruthy();
  });

  it('renders the pulse as economy only', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('.pulse')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.pulse__hero')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.pulse__facts')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.pulse__spend')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.period-card')).toBeFalsy();
    expect(page.dueRoute()).toBe('/maintenance');
    expect(page.dueTone()).toBe('none');
    expect(page.economyCaption()).toBeNull();
  });

  it('keeps an empty reports tab free of a spend hero', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.componentInstance.view.set('reports');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.report-hero')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.empty-state')).toBeTruthy();
  });

  it('hides the needs list when nothing is urgent', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.needs')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.vehicle-status')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-weather-tip')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.rec-section')).toBeFalsy();
  });
});
