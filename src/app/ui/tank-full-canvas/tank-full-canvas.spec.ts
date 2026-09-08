import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TankFullCanvas } from './tank-full-canvas';
import { MotionPolicy } from '../motion/motion-policy';

describe('TankFullCanvas', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TankFullCanvas],
      providers: [MotionPolicy],
    });
  });

  it('toggles binary tankFull via switch keyboard', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const fixture = TestBed.createComponent(TankFullCanvas);
    fixture.componentRef.setInput('label', 'Tank full');
    fixture.componentRef.setInput('onLabel', 'Full');
    fixture.componentRef.setInput('offLabel', 'Not full');
    fixture.componentInstance.value.set(false);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-checked')).toBe('false');
    btn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe(true);
    expect(btn.getAttribute('aria-checked')).toBe('true');
    vi.unstubAllGlobals();
  });
});
