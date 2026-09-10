import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  App,
  SPLASH_SESSION_KEY,
  markSplashSeen,
  shouldShowSplash,
} from './app';
import { routes } from './app.routes';
import { Db } from './data/db';

describe('shouldShowSplash', () => {
  it('skips when reduced motion', () => {
    expect(shouldShowSplash({ getItem: () => null }, true)).toBe(false);
  });

  it('skips when this session already showed it', () => {
    expect(shouldShowSplash({ getItem: () => '1' }, false)).toBe(false);
  });

  it('shows on a fresh session', () => {
    expect(shouldShowSplash({ getItem: () => null }, false)).toBe(true);
  });

  it('marks the session so in-tab nav does not replay', () => {
    const store: Record<string, string> = {};
    markSplashSeen({
      setItem: (k, v) => {
        store[k] = v;
      },
    });
    expect(store[SPLASH_SESSION_KEY]).toBe('1');
  });
});

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
        {
          provide: Db,
          useValue: {
            ready: () => true,
            error: () => null,
            car: () => null,
            settings: () => ({
              language: 'en',
              theme: 'dark',
              currency: 'EGP',
              unitSystem: 'metric',
              installBannerDismissed: true,
            }),
            fillUps: () => [],
            maintenance: () => [],
            savedFlash: () => false,
            init: async () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.version).toBe('1.2');
  });
});
