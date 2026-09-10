import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { APP_VERSION } from './core/config';
import { I18n } from './i18n/i18n';
import { Shell } from './layout/shell';

export const SPLASH_SESSION_KEY = 'drivelog-splash';
export const SPLASH_MS = 1200;

export function shouldShowSplash(
  storage: Pick<Storage, 'getItem'> | null,
  reducedMotion: boolean,
): boolean {
  if (reducedMotion) {
    return false;
  }
  try {
    return storage?.getItem(SPLASH_SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markSplashSeen(storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(SPLASH_SESSION_KEY, '1');
  } catch {
    /* private mode */
  }
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Shell],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly i18n = inject(I18n);
  readonly version = APP_VERSION;
  readonly splashVisible = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage;
    if (!shouldShowSplash(storage, reduced)) {
      return;
    }
    this.splashVisible.set(true);
    const timer = setTimeout(() => {
      this.splashVisible.set(false);
      markSplashSeen(storage);
    }, SPLASH_MS);
    destroyRef.onDestroy(() => clearTimeout(timer));
  }
}
