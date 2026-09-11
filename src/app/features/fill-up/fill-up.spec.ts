import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { FillUpPage } from './fill-up';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import { routes } from '../../app.routes';
import { TANK_FALLBACK } from '../../domain/fill-up-distance';

describe('FillUpPage', () => {
  const fillUps = signal<
    {
      id: string;
      odometer: number;
      liters: number;
      cost: number;
      tankFull: boolean;
      date: string;
      createdAt: string;
      updatedAt: string;
      unitPrice?: number;
      fuelGrade?: string;
    }[]
  >([]);
  const settings = signal({
    currency: 'EGP',
    language: 'en' as const,
    sampleMode: false as boolean | undefined,
    firstRealFillAt: undefined as string | undefined,
  });
  const saveFillUp = vi.fn(async () => {
    fillUps.update((list) => [
      ...list,
      {
        id: `f-${list.length + 1}`,
        odometer: 10100,
        liters: 40,
        cost: 500,
        tankFull: false,
        date: '2026-09-11',
        createdAt: '2026-09-11T00:00:00.000Z',
        updatedAt: '2026-09-11T00:00:00.000Z',
        unitPrice: 12.5,
        fuelGrade: 'gasoline95',
      },
    ]);
  });
  const updateSettings = vi.fn(async (patch: Record<string, unknown>) => {
    settings.update((s) => ({ ...s, ...patch }));
  });

  beforeEach(async () => {
    fillUps.set([]);
    settings.set({
      currency: 'EGP',
      language: 'en',
      sampleMode: false,
      firstRealFillAt: undefined,
    });
    saveFillUp.mockClear();
    updateSettings.mockClear();

    await TestBed.configureTestingModule({
      imports: [FillUpPage],
      providers: [
        provideRouter(routes),
        {
          provide: Db,
          useValue: {
            car: () => ({
              id: 'c1',
              currentOdometer: 10000,
              initialOdometer: 10000,
              nickname: 'Test',
              tankCapacityLiters: 50,
            }),
            settings: () => settings(),
            fillUps: () => fillUps(),
            saveFillUp,
            updateSettings,
          },
        },
        {
          provide: I18n,
          useValue: {
            t: (k: string, p?: Record<string, string | number>) => {
              if (p) {
                return `${k}:${JSON.stringify(p)}`;
              }
              return k;
            },
            formatNumber: (n: number) => String(n),
            language: () => 'en',
            dir: () => 'ltr',
          },
        },
      ],
    }).compileComponents();
  });

  it('uses tank capacity fallback when unset on car', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [FillUpPage],
      providers: [
        provideRouter(routes),
        {
          provide: Db,
          useValue: {
            car: () => ({
              id: 'c1',
              currentOdometer: 10000,
              initialOdometer: 0,
              nickname: 'Test',
            }),
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
          useValue: {
            t: (k: string) => k,
            formatNumber: (n: number) => String(n),
            language: () => 'en',
            dir: () => 'ltr',
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FillUpPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.tankCapacity()).toBe(TANK_FALLBACK);
  });

  it('stays on fill-up with next-due banner after first real save', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(FillUpPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.distanceKm.set('100');
    page.liters.set('40');
    page.fuelGrade.set('custom');
    // Force unit price via last paid path: seed lastUnit by temporarily adding nothing —
    // custom grade uses lastUnit; without history pickUnitPrice may be null.
    // Use gasoline95 with mocked prices via setting custom and last fill history empty.
    // Instead set fuelGrade custom and patch lastUnit by adding a prior fill with unitPrice
    // before save but that would make wasFirstReal false. So mock fuelPrices path:
    page.fuelPrices.set({
      country: 'EG',
      currency: 'EGP',
      gasoline92: 12,
      gasoline95: 13.5,
      diesel: 10,
      solar: 9,
      updatedAt: '2026-09-11',
    } as never);
    page.fuelGrade.set('gasoline95');
    page.date.set('2026-09-11');
    page.onDistanceChange();

    await page.save();
    fixture.detectChanges();

    expect(saveFillUp).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ firstRealFillAt: expect.any(String) }),
    );
    expect(page.nextDueBanner()).toBe(true);
    expect(page.distanceKm()).toBe('');
    expect(page.liters()).toBe('');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('navigates to /fuel on second fill save without banner', async () => {
    fillUps.set([
      {
        id: 'f1',
        odometer: 10050,
        liters: 30,
        cost: 400,
        tankFull: false,
        date: '2026-09-01',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        unitPrice: 12.5,
        fuelGrade: 'gasoline95',
      },
    ]);
    settings.set({
      currency: 'EGP',
      language: 'en',
      sampleMode: false,
      firstRealFillAt: '2026-09-01T00:00:00.000Z',
    });

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(FillUpPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.distanceKm.set('80');
    page.liters.set('35');
    page.fuelGrade.set('gasoline95');
    page.fuelPrices.set({
      country: 'EG',
      currency: 'EGP',
      gasoline92: 12,
      gasoline95: 13.5,
      diesel: 10,
      solar: 9,
      updatedAt: '2026-09-11',
    } as never);
    page.date.set('2026-09-11');
    page.onDistanceChange();

    await page.save();

    expect(saveFillUp).toHaveBeenCalledOnce();
    expect(page.nextDueBanner()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith('/fuel');
  });
});
