import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { WhatsNew } from './whats-new';

export const SW_RELOAD_KEY = 'drivelog.swReloaded';
/** Quiet reload waits for this much idle time, so a keystroke is never lost. */
export const SW_IDLE_RELOAD_MS = 45_000;
/** Stop hunting for a quiet moment after this long; the next cold open loads the new build anyway. */
export const SW_QUIET_WINDOW_MS = 15 * 60 * 1000;

export function shouldAutoApplySwUpdate(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): boolean {
  if (!storage) {
    return true;
  }
  try {
    if (storage.getItem(SW_RELOAD_KEY)) {
      return false;
    }
    storage.setItem(SW_RELOAD_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

export type QuietReloadState = {
  readonly hidden: boolean;
  readonly editing: boolean;
  readonly dialogOpen: boolean;
  readonly idleMs: number;
};

/**
 * A new build reloads itself only when it cannot interrupt the user: the app is
 * in the background, or nothing is focused and the screen has been idle. A
 * focused field or an open sheet always wins, and the reload waits for later.
 */
export function mayReloadQuietly(state: QuietReloadState): boolean {
  if (state.editing || state.dialogOpen) {
    return false;
  }
  if (state.hidden) {
    return true;
  }
  return state.idleMs >= SW_IDLE_RELOAD_MS;
}

@Injectable({ providedIn: 'root' })
export class InstallPwa {
  private deferred: BeforeInstallPromptEvent | null = null;
  private readonly updates = inject(SwUpdate);
  private readonly whatsNew = inject(WhatsNew);
  readonly canPrompt = signal(false);
  readonly installed = signal(this.detectInstalled());
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  readonly isSafari =
    /safari/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios|chrome/i.test(navigator.userAgent);
  private lastInteractionAt = Date.now();
  private quietReloadArmed = false;

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
    this.trackActivity();
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

  private trackActivity(): void {
    const touch = () => {
      this.lastInteractionAt = Date.now();
    };
    for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
      window.addEventListener(type, touch, { passive: true });
    }
  }

  /**
   * No prompt, no sheet: activate the new build straight away, then reload at a
   * moment that cannot cut into typing. Activation alone already means the next
   * cold open serves the new build, so a missed quiet moment costs nothing.
   */
  async applyUpdateQuietly(): Promise<void> {
    if (this.updates.isEnabled) {
      try {
        await this.updates.activateUpdate();
      } catch {
        // ponytail: activate can fail if SW already gone; reload still picks up cache
      }
    }
    this.armQuietReload();
  }

  private armQuietReload(): void {
    if (this.quietReloadArmed || typeof document === 'undefined') {
      return;
    }
    this.quietReloadArmed = true;
    const editing = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      );
    };
    const attempt = (): boolean => {
      const state: QuietReloadState = {
        hidden: document.visibilityState === 'hidden',
        editing: editing(),
        dialogOpen: document.querySelector('dialog[open]') !== null,
        idleMs: Date.now() - this.lastInteractionAt,
      };
      if (!mayReloadQuietly(state)) {
        return false;
      }
      const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage;
      if (!shouldAutoApplySwUpdate(storage)) {
        return true; // already reloaded once this session; the next open finishes it
      }
      window.location.reload();
      return true;
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        attempt();
      }
    });
    const timer = setInterval(() => {
      if (attempt()) {
        clearInterval(timer);
      }
    }, 10_000);
    setTimeout(() => clearInterval(timer), SW_QUIET_WINDOW_MS);
  }

  private watchUpdates(): void {
    if (!this.updates.isEnabled) {
      return;
    }
    this.updates.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        void this.applyUpdateQuietly();
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
