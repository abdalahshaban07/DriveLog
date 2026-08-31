import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FillUpPage } from './fill-up';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { routes } from '../../app.routes';

describe('FillUpPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FillUpPage],
      providers: [
        provideRouter(routes),
        {
          provide: Db,
          useValue: {
            car: () => ({ id: 'c1', currentOdometer: 10000, initialOdometer: 0, nickname: 'Test' }),
            settings: () => ({ currency: 'EGP', language: 'en' }),
            fillUps: () => [
              {
                id: 'f1',
                odometer: 9000,
                liters: 42,
                cost: 60,
                tankFull: true,
                date: '2026-01-15',
                createdAt: '2026-01-15T00:00:00.000Z',
                updatedAt: '2026-01-15T00:00:00.000Z',
              },
            ],
          },
        },
        {
          provide: I18n,
          useValue: { t: (k: string) => k, language: () => 'en' },
        },
      ],
    }).compileComponents();
  });

  it('derives maxLiters from last full fill', () => {
    const fixture = TestBed.createComponent(FillUpPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.maxLiters()).toBe(42);
  });
});
