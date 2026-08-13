import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InstallPwa {
  private deferred: BeforeInstallPromptEvent | null = null;
  private waitingWorker: ServiceWorker | null = null;
  readonly canPrompt = signal(false);
  readonly installed = signal(this.detectInstalled());
  readonly updateReady = signal(false);
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  readonly isSafari =
    /safari/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios|chrome/i.test(navigator.userAgent);

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installed.set(true);
      this.canPrompt.set(false);
      this.deferred = null;
    });
    this.watchServiceWorker();
  }

  detectInstalled(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const standalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
    return standalone || iosStandalone;
  }

  async promptInstall(): Promise<void> {
    if (!this.deferred) {
      return;
    }
    await this.deferred.prompt();
    this.deferred = null;
    this.canPrompt.set(false);
  }

  applyUpdate(): void {
    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }

  private watchServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    void navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        this.waitingWorker = reg.waiting;
        this.updateReady.set(true);
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) {
          return;
        }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            this.waitingWorker = reg.waiting;
            this.updateReady.set(true);
          }
        });
      });
    });
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
