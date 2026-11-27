import { ErrorHandler, Injectable } from '@angular/core';

const RELOAD_KEY = 'drivelog.chunk-reload';

/** A new deploy removes old chunk files; a stale tab then fails to open a page. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Loading chunk|Importing a module script failed/i.test(message);
}

@Injectable()
class DriveLogErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error('[DriveLog]', error);
    if (!isStaleChunkError(error)) {
      return;
    }
    // Reload once (never in a loop) so the page picks up the new version.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        location.reload();
      }
    } catch {
      // storage blocked: leave the page as it is
    }
  }
}

export function provideDriveLogErrorHandler() {
  return { provide: ErrorHandler, useClass: DriveLogErrorHandler };
}
