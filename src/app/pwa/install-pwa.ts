import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InstallPwa {
  private deferred: BeforeInstallPromptEvent | null = null;
  private readonly updates = inject(SwUpdate);
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
    this.watchUpdates();
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

  async applyUpdate(): Promise<void> {
    if (this.updates.isEnabled) {
      try {
        await this.updates.activateUpdate();
      } catch {
        // ponytail: activate can fail if SW already gone; reload still picks up cache
      }
    }
    window.location.reload();
  }

  private watchUpdates(): void {
    if (!this.updates.isEnabled) {
      return;
    }
    this.updates.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
