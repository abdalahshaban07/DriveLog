import { Injectable, signal } from '@angular/core';

export type AnimeSurface = 'sparkline' | 'ledger' | 'receipt' | 'stackBar';
export type WebGlSurface = 'fillUpTank' | 'homeAmbient';

@Injectable({ providedIn: 'root' })
export class MotionPolicy {
  private readonly activeWebGl = signal<WebGlSurface | null>(null);

  prefersReducedMotion(): boolean {
    return (
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  allowAnime(surface: AnimeSurface): boolean {
    return !this.prefersReducedMotion();
  }

  allowWebGL(surface: WebGlSurface): boolean {
    if (this.prefersReducedMotion()) {
      return false;
    }
    const active = this.activeWebGl();
    return active == null || active === surface;
  }

  claimWebGL(surface: WebGlSurface): boolean {
    if (!this.allowWebGL(surface)) {
      return false;
    }
    this.activeWebGl.set(surface);
    return true;
  }

  releaseWebGL(surface: WebGlSurface): void {
    if (this.activeWebGl() === surface) {
      this.activeWebGl.set(null);
    }
  }
}
