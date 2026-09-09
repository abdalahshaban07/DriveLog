import { Injectable } from '@angular/core';

export type AnimeSurface =
  | 'sparkline'
  | 'barChart'
  | 'lineChart'
  | 'donutChart'
  | 'ledger'
  | 'receipt'
  | 'stackBar'
  | 'fuelTank'
  | 'updateModal';

@Injectable({ providedIn: 'root' })
export class MotionPolicy {
  prefersReducedMotion(): boolean {
    return (
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  allowAnime(surface: AnimeSurface): boolean {
    void surface;
    return !this.prefersReducedMotion();
  }
}
