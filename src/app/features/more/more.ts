import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';

type MoreLink = {
  route: string;
  labelKey: MsgKey;
};

@Component({
  selector: 'app-more',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink],
  templateUrl: './more.html',
  styleUrl: './more.scss',
})
export class MorePage {
  readonly i18n = inject(I18n);

  readonly links = computed<MoreLink[]>(() => [
    { route: '/settings', labelKey: 'more.settings' },
    { route: '/assistant', labelKey: 'more.assistant' },
    { route: '/breakdowns', labelKey: 'more.breakdowns' },
    { route: '/other-expenses', labelKey: 'more.otherExpenses' },
    { route: '/history/fill-ups', labelKey: 'more.fillUpHistory' },
    { route: '/history/maintenance', labelKey: 'more.maintHistory' },
    { route: '/settings/types', labelKey: 'more.maintenanceTypes' },
  ]);
}
