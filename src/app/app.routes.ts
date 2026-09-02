import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { setupGuard, setupPageGuard } from './core/guards/setup.guard';

const insightsChartsRedirect: CanActivateFn = () =>
  inject(Router).createUrlTree(['/'], { queryParams: { view: 'charts' } });

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () =>
      import('./features/first-run/first-run').then((m) => m.FirstRunPage),
    canActivate: [setupPageGuard],
  },
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.HomePage),
    canActivate: [setupGuard],
  },
  {
    path: 'fuel',
    loadComponent: () => import('./features/fuel/fuel').then((m) => m.FuelPage),
    canActivate: [setupGuard],
  },
  {
    path: 'fill-up',
    loadComponent: () =>
      import('./features/fill-up/fill-up').then((m) => m.FillUpPage),
    canActivate: [setupGuard],
  },
  {
    path: 'history/fill-ups',
    loadComponent: () =>
      import('./features/fill-up-history/fill-up-history').then(
        (m) => m.FillUpHistoryPage,
      ),
    canActivate: [setupGuard],
  },
  {
    path: 'history/maintenance',
    loadComponent: () =>
      import('./features/maintenance-history/maintenance-history').then(
        (m) => m.MaintenanceHistoryPage,
      ),
    canActivate: [setupGuard],
  },
  {
    path: 'maintenance',
    loadComponent: () =>
      import('./features/maintenance/maintenance').then((m) => m.MaintenancePage),
    canActivate: [setupGuard],
  },
  {
    path: 'insights',
    canActivate: [insightsChartsRedirect],
    loadComponent: () => import('./features/home/home').then((m) => m.HomePage),
  },
  {
    path: 'more',
    loadComponent: () => import('./features/more/more').then((m) => m.MorePage),
    canActivate: [setupGuard],
  },
  {
    path: 'assistant',
    loadComponent: () =>
      import('./features/assistant/assistant').then((m) => m.AssistantPage),
    canActivate: [setupGuard],
  },
  {
    path: 'breakdowns',
    loadComponent: () =>
      import('./features/breakdowns/breakdowns').then((m) => m.BreakdownsPage),
    canActivate: [setupGuard],
  },
  {
    path: 'other-expenses',
    loadComponent: () =>
      import('./features/other-expenses/other-expenses').then(
        (m) => m.OtherExpensesPage,
      ),
    canActivate: [setupGuard],
  },
  {
    path: 'settings/types',
    loadComponent: () =>
      import('./features/maintenance-types/maintenance-types').then(
        (m) => m.MaintenanceTypesPage,
      ),
    canActivate: [setupGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings').then((m) => m.SettingsPage),
    canActivate: [setupGuard],
  },
  { path: '**', redirectTo: '' },
];
