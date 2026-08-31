import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FuelTankCanvas } from './fuel-tank-canvas';
import { MotionPolicy } from '../motion/motion-policy';
import { I18n } from '../../i18n/i18n';

describe('FuelTankCanvas', () => {
  it('uses CSS fallback when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    TestBed.configureTestingModule({
      imports: [FuelTankCanvas],
      providers: [
        MotionPolicy,
        {
          provide: I18n,
          useValue: {
            t: (k: string, p?: Record<string, string | number>) =>
              p ? `${k}:${JSON.stringify(p)}` : k,
            language: () => 'en',
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(FuelTankCanvas);
    fixture.componentRef.setInput('liters', 25);
    fixture.componentRef.setInput('maxLiters', 50);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tank-fallback')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('caps partial fill ratio at 85%', () => {
    TestBed.configureTestingModule({
      imports: [FuelTankCanvas],
      providers: [
        MotionPolicy,
        {
          provide: I18n,
          useValue: { t: (k: string) => k, language: () => 'en' },
        },
      ],
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const fixture = TestBed.createComponent(FuelTankCanvas);
    fixture.componentRef.setInput('liters', 100);
    fixture.componentRef.setInput('maxLiters', 50);
    fixture.componentRef.setInput('tankFull', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.fillRatio()).toBe(0.85);
    vi.unstubAllGlobals();
  });
});
