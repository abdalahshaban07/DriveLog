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

  it('builds recommendations and month outlook', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.recommendations().length).toBeGreaterThan(0);
    expect(page.monthOutlook().actual).toBe(0);
    expect(page.monthOutlook().projected).toBeNull();
    expect(page.monthPace(10, 31)).toBe(32);
    expect(page.monthPace(0, 0)).toBe(0);
  });

  it('renders dashboard list-reveal panel', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.home-panel--dashboard.list-reveal');
    expect(panel).toBeTruthy();
  });

  it('renders the pulse glance and a flat month compare', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('.pulse')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.pulse__hero')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.glance-strip')).toBeFalsy();
    expect(page.spendShare('current')).toBe(0);
    expect(page.spendShare('previous')).toBe(0);
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

  it('shows vehicle status block with health link', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('.vehicle-status');
    expect(status).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/health"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.advisor-card')).toBeFalsy();
  });
});
