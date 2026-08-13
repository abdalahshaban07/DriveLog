import { ErrorHandler, Injectable, inject } from '@angular/core';

@Injectable()
export class DriveLogErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error('[DriveLog]', error);
  }
}

export function provideDriveLogErrorHandler() {
  return { provide: ErrorHandler, useClass: DriveLogErrorHandler };
}

/** Convenience inject for future UI toast wiring. */
export function injectErrorHandler(): ErrorHandler {
  return inject(ErrorHandler);
}
