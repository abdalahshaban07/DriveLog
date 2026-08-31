import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FuelTankCanvas } from './fuel-tank-canvas';
import { MotionPolicy } from '../motion/motion-policy';
import { I18n } from '../../i18n/i18n';

const i18nMock = {
  t: (k: string, p?: Record<string, string | number>) =>
    p ? `${k}:${JSON.stringify(p)}` : k,
  language: () => 'en' as const,
};

describe('FuelTankCanvas', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FuelTankCanvas],
      providers: [
        MotionPolicy,
        { provide: I18n, useValue: i18nMock },
      ],
    });
  });

  it('uses CSS fallback when reduced motion is preferred', () => {    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const fixture = TestBed.createComponent(FuelTankCanvas);    fixture.componentRef.setInput('liters', 25);
    fixture.componentRef.setInput('tankCapacityLiters', 50);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tank-fallback')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('clamps fill ratio to [0, 1]', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const fixture = TestBed.createComponent(FuelTankCanvas);    fixture.componentRef.setInput('liters', 100);
    fixture.componentRef.setInput('tankCapacityLiters', 50);
    fixture.detectChanges();
    expect(fixture.componentInstance.fillRatio()).toBe(1);
    fixture.componentRef.setInput('liters', -5);
    fixture.detectChanges();
    expect(fixture.componentInstance.fillRatio()).toBe(0);
    vi.unstubAllGlobals();
  });
});
