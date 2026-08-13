import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';
import { WhatsNew } from './whats-new';

@Injectable({ providedIn: 'root' })
export class InstallPwa {
  private deferred: BeforeInstallPromptEvent | null = null;
  private readonly updates = inject(SwUpdate);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(I18n);
  private readonly whatsNew = inject(WhatsNew);
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
    void this.whatsNew.load();
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
      .subscribe(() => {
        this.updateReady.set(true);
        // Notes file may still be the old cached one until reload.
        this.notify.notifyUpdate(
          this.i18n.t('update.available'),
          this.i18n.t('update.notifyBody'),
        );
      });

    // ponytail: poll while tab open so gh-pages deploys surface without a hard refresh
    const tick = () => {
      void this.updates.checkForUpdate().catch(() => undefined);
    };
    tick();
    setInterval(tick, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    });
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
