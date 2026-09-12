import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';

type FeatureRow = { titleKey: MsgKey; bodyKey: MsgKey };

type FeatureGroup = {
  headingKey: MsgKey;
  items: readonly FeatureRow[];
};

/**
 * SSOT for /settings/features — keep in sync with shipped surfaces
 * (routes, history PDF export, local coach). No BYOK / API-key claims.
 */
export const FEATURE_CATALOG: readonly FeatureGroup[] = [
  {
    headingKey: 'features.group.core',
    items: [
      { titleKey: 'features.home.title', bodyKey: 'features.home.body' },
      { titleKey: 'features.fuel.title', bodyKey: 'features.fuel.body' },
      { titleKey: 'features.around.title', bodyKey: 'features.around.body' },
      { titleKey: 'features.maintenance.title', bodyKey: 'features.maintenance.body' },
      { titleKey: 'features.fillUp.title', bodyKey: 'features.fillUp.body' },
    ],
  },
  {
    headingKey: 'features.group.history',
    items: [
      { titleKey: 'features.fillHistory.title', bodyKey: 'features.fillHistory.body' },
      { titleKey: 'features.maintHistory.title', bodyKey: 'features.maintHistory.body' },
      { titleKey: 'features.exportPdf.title', bodyKey: 'features.exportPdf.body' },
    ],
  },
  {
    headingKey: 'features.group.tools',
    items: [
      { titleKey: 'features.assistant.title', bodyKey: 'features.assistant.body' },
      { titleKey: 'features.breakdowns.title', bodyKey: 'features.breakdowns.body' },
      { titleKey: 'features.expenses.title', bodyKey: 'features.expenses.body' },
    ],
  },
  {
    headingKey: 'features.group.device',
    items: [
      { titleKey: 'features.whatsNew.title', bodyKey: 'features.whatsNew.body' },
      { titleKey: 'features.reminders.title', bodyKey: 'features.reminders.body' },
    ],
  },
];

@Component({
  selector: 'app-features-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader],
  templateUrl: './app-features.html',
  styleUrl: './app-features.scss',
})
export class AppFeaturesPage {
  readonly i18n = inject(I18n);
  readonly router = inject(Router);

  readonly groups = FEATURE_CATALOG;

  /** Flat count for tests / sanity checks. */
  readonly items = FEATURE_CATALOG.flatMap((g) => g.items);
}
