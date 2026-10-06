import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { InstallPwa } from '../../pwa/install-pwa';
import { routes } from '../../app.routes';

describe('HomePage', () => {
  let maintenanceRows: { id: string; type: string; dueKm: number; date: string; odometer: number }[] = [];
  let fuelUseFills: {
    id: string;
    date: string;
    liters: number;
    cost: number;
    odometer: number;
    distanceKm: number;
    tankFull: boolean;
    createdAt: string;
    updatedAt: string;
  }[] = [];

  beforeEach(async () => {
    fuelUseFills = [];
    maintenanceRows = [];
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
            fillUps: () => fuelUseFills,
            maintenance: () => maintenanceRows,
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
    expect(page.fuelUse()).toBeNull();
    expect(fixture.nativeElement.querySelector('.fuel-use')).toBeFalsy();
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
    expect(fixture.nativeElement.querySelector('.reports-range')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.reports-list')).toBeFalsy();
    expect(fixture.componentInstance.reportRangePreset()).toBe('3months');
  });

  it('sums the reports sheet inside the selected range', () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${now.getFullYear()}-${month}-${day}`;
    const stamp = (date: string) => ({
      createdAt: `${date}T00:00:00.000Z`,
      updatedAt: `${date}T00:00:00.000Z`,
    });
    fuelUseFills.push(
      {
        id: 'in',
        date: today,
        liters: 28.1,
        cost: 914,
        odometer: 1514,
        distanceKm: 514,
        tankFull: true,
        ...stamp(today),
      },
      {
        id: 'out',
        date: '2020-01-01',
        liters: 40,
        cost: 5000,
        odometer: 100,
        distanceKm: 400,
        tankFull: true,
        ...stamp('2020-01-01'),
      },
    );
    const fixture = TestBed.createComponent(HomePage);
    fixture.componentInstance.view.set('reports');
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.report-hero')?.textContent ?? '';
    expect(hero).toContain('914');
    expect(hero).not.toContain('5000');
    expect(hero).toContain('reports.costKm');
    expect(fixture.nativeElement.querySelector('.report-mix')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.reports-list')).toBeFalsy();
    fixture.componentInstance.setReportRange('custom');
    fixture.componentInstance.reportFrom.set('2020-01-01');
    fixture.componentInstance.reportTo.set('2020-01-31');
    fixture.detectChanges();
    const custom = fixture.nativeElement.querySelector('.report-hero')?.textContent ?? '';
    expect(custom).toContain('5000');
    expect(custom).not.toContain('914');
    expect(fixture.nativeElement.querySelector('.reports-range__dates')).toBeTruthy();
  });

  it('hides the needs list when nothing is urgent', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.needs')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.vehicle-status')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.coming')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('app-weather-tip')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.rec-section')).toBeFalsy();
  });

  it('explains a liter drop by the shorter distance', () => {
    const now = new Date();
    const day = Math.min(now.getDate(), 28);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, day);
    const curr = new Date(now.getFullYear(), now.getMonth(), day);
    const stamp = (date: Date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const dom = String(date.getDate()).padStart(2, '0');
      return `${date.getFullYear()}-${month}-${dom}`;
    };
    const row = (id: string, date: string, liters: number, distanceKm: number, odometer: number) => ({
      id,
      date,
      liters,
      cost: liters,
      odometer,
      distanceKm,
      tankFull: true,
      createdAt: `${date}T00:00:00.000Z`,
      updatedAt: `${date}T00:00:00.000Z`,
    });
    fuelUseFills.push(row('f-prev', stamp(prev), 39, 510, 1510), row('f-now', stamp(curr), 24, 320, 1830));
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fuel-use')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.month-outlook .fuel-use__why')?.textContent).toBe(
      'home.useWhy.down.distance',
    );
    const facts = fixture.nativeElement.querySelector('.fuel-use__facts')?.textContent ?? '';
    expect(facts).toContain('home.useDistance');
    expect(facts).toContain('home.useLiters');
    const order = [...fixture.nativeElement.querySelectorAll(
      '.pulse, app-weather-tip, app-quick-log, .needs, .coming, .month-outlook, .vehicle-status',
    )].map((node: Element) => node.tagName === 'APP-WEATHER-TIP' || node.tagName === 'APP-QUICK-LOG'
      ? node.tagName.toLowerCase()
      : [...node.classList].find((name) => name !== 'list-reveal') ?? node.tagName);
    expect(order).toEqual(['pulse', 'app-weather-tip', 'app-quick-log', 'month-outlook']);
  });

  it('shows the next maintenance as a quiet line until it is urgent', () => {
    maintenanceRows.push({ id: 'm1', type: 'oil', dueKm: 5000, date: '2026-01-01', odometer: 1000 });
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.needs')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.coming')?.textContent).toContain('home.nextDue');
    expect(fixture.nativeElement.querySelector('.coming__value')?.textContent).toBe('home.comingLine');
  });
});
