import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { Db } from './data/db';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: Db,
          useValue: {
            ready: () => true,
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
  });
});
