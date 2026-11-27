import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  inject,
  isDevMode,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { provideDriveLogErrorHandler } from './core/error-handler';
import { Db } from './data/db';
import { provideServiceWorker } from '@angular/service-worker';
import { requestPersistentStorage, storageManager } from './pwa/storage-persist';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideDriveLogErrorHandler(),
    provideRouter(routes, withViewTransitions()),
    provideAppInitializer(() => inject(Db).init()),
    // Local-only records: ask the browser not to evict them. Fire and forget.
    provideAppInitializer(() => {
      void requestPersistentStorage(storageManager());
    }),
    provideServiceWorker('drivelog-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:5000',
    }),
  ],
};
