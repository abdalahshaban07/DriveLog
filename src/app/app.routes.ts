import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { setupGuard, setupPageGuard } from './core/guards/setup.guard';
import { AssistantPage } from './features/assistant/assistant';
import { BreakdownsPage } from './features/breakdowns/breakdowns';
import { FillUpPage } from './features/fill-up/fill-up';
import { FillUpHistoryPage } from './features/fill-up-history/fill-up-history';
import { FirstRunPage } from './features/first-run/first-run';
import { FuelPage } from './features/fuel/fuel';
import { HomePage } from './features/home/home';
import { MaintenancePage } from './features/maintenance/maintenance';
import { MaintenanceTypesPage } from './features/maintenance-types/maintenance-types';
import { MorePage } from './features/more/more';
import { OtherExpensesPage } from './features/other-expenses/other-expenses';
import { SettingsPage } from './features/settings/settings';

const insightsChartsRedirect: CanActivateFn = () =>
  inject(Router).createUrlTree(['/'], { queryParams: { view: 'charts' } });

export const routes: Routes = [
  { path: 'setup', component: FirstRunPage, canActivate: [setupPageGuard] },
  { path: '', component: HomePage, canActivate: [setupGuard] },
  { path: 'fuel', component: FuelPage, canActivate: [setupGuard] },
  { path: 'fill-up', component: FillUpPage, canActivate: [setupGuard] },
  {
    path: 'history/fill-ups',
    component: FillUpHistoryPage,
    canActivate: [setupGuard],
  },
  {
    path: 'maintenance',
    component: MaintenancePage,
    canActivate: [setupGuard],
  },
  {
    path: 'insights',
    canActivate: [insightsChartsRedirect],
    component: HomePage,
  },
  { path: 'more', component: MorePage, canActivate: [setupGuard] },
  { path: 'assistant', component: AssistantPage, canActivate: [setupGuard] },
  { path: 'breakdowns', component: BreakdownsPage, canActivate: [setupGuard] },
  {
    path: 'other-expenses',
    component: OtherExpensesPage,
    canActivate: [setupGuard],
  },
  {
    path: 'settings/types',
    component: MaintenanceTypesPage,
    canActivate: [setupGuard],
  },
  { path: 'settings', component: SettingsPage, canActivate: [setupGuard] },
  { path: '**', redirectTo: '' },
];
