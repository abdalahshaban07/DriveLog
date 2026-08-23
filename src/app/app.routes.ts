import { Routes } from '@angular/router';
import { setupGuard, setupPageGuard } from './core/guards/setup.guard';
import { FirstRunPage } from './features/first-run/first-run';
import { FillUpPage } from './features/fill-up/fill-up';
import { FillUpHistoryPage } from './features/fill-up-history/fill-up-history';
import { HomePage } from './features/home/home';
import { InsightsPage } from './features/insights/insights';
import { MaintenancePage } from './features/maintenance/maintenance';
import { MaintenanceTypesPage } from './features/maintenance-types/maintenance-types';
import { SettingsPage } from './features/settings/settings';

export const routes: Routes = [
  { path: 'setup', component: FirstRunPage, canActivate: [setupPageGuard] },
  { path: '', component: HomePage, canActivate: [setupGuard] },
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
    component: InsightsPage,
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
