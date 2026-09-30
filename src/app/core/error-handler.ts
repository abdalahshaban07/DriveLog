import { ErrorHandler, Injectable } from '@angular/core';

@Injectable()
export class DriveLogErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error('[DriveLog]', error);
  }
}

export function provideDriveLogErrorHandler() {
  return { provide: ErrorHandler, useClass: DriveLogErrorHandler };
}
