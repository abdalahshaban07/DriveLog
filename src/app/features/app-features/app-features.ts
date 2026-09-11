import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';

type FeatureRow = { titleKey: MsgKey; bodyKey: MsgKey };

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

  readonly items: readonly FeatureRow[] = [
    { titleKey: 'features.home.title', bodyKey: 'features.home.body' },
    { titleKey: 'features.fuel.title', bodyKey: 'features.fuel.body' },
    { titleKey: 'features.around.title', bodyKey: 'features.around.body' },
    { titleKey: 'features.maintenance.title', bodyKey: 'features.maintenance.body' },
    { titleKey: 'features.fillUp.title', bodyKey: 'features.fillUp.body' },
    { titleKey: 'features.fillHistory.title', bodyKey: 'features.fillHistory.body' },
    { titleKey: 'features.maintHistory.title', bodyKey: 'features.maintHistory.body' },
    { titleKey: 'features.assistant.title', bodyKey: 'features.assistant.body' },
    { titleKey: 'features.breakdowns.title', bodyKey: 'features.breakdowns.body' },
    { titleKey: 'features.expenses.title', bodyKey: 'features.expenses.body' },
    { titleKey: 'features.whatsNew.title', bodyKey: 'features.whatsNew.body' },
    { titleKey: 'features.reminders.title', bodyKey: 'features.reminders.body' },
  ];
}
