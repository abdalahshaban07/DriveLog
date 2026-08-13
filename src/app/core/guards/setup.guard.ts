import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Db } from '../../data/db';

/** Redirects to /setup when no car exists. Phase 1: works once Db is ready. */
export const setupGuard: CanActivateFn = () => {
  const db = inject(Db);
  const router = inject(Router);
  if (!db.ready()) {
    return true;
  }
  if (!db.car()) {
    return router.createUrlTree(['/setup']);
  }
  return true;
};

export const setupPageGuard: CanActivateFn = () => {
  const db = inject(Db);
  const router = inject(Router);
  if (!db.ready()) {
    return true;
  }
  if (db.car()) {
    return router.createUrlTree(['/']);
  }
  return true;
};
