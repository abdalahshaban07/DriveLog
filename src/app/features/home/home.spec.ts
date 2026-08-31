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
          useValue: { t: (k: string) => k, language: () => 'en' },
        },
      ],
    }).compileComponents();
  });

  it('exposes report count for tab badge', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.componentInstance.reportCount()).toBeGreaterThanOrEqual(0);
  });
});
