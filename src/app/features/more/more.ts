import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';

type MoreLink = {
  route: string;
  labelKey: MsgKey;
};

export type MoreSection = {
  headingKey: MsgKey;
  items: readonly MoreLink[];
};

export const MORE_SECTIONS: readonly MoreSection[] = [
  {
    headingKey: 'more.group.app',
    items: [
      { route: '/settings', labelKey: 'more.settings' },
      { route: '/settings/features', labelKey: 'settings.features' },
    ],
  },
  {
    headingKey: 'more.group.logs',
    items: [
      { route: '/history/fill-ups', labelKey: 'more.fillUpHistory' },
      { route: '/history/maintenance', labelKey: 'more.maintHistory' },
      { route: '/breakdowns', labelKey: 'more.breakdowns' },
      { route: '/other-expenses', labelKey: 'more.otherExpenses' },
    ],
  },
  {
    headingKey: 'more.group.tools',
    items: [
      { route: '/health', labelKey: 'more.health' },
      { route: '/budget', labelKey: 'more.budget' },
      { route: '/vault', labelKey: 'more.vault' },
      { route: '/pre-trip', labelKey: 'more.preTrip' },
    ],
  },
  {
    headingKey: 'more.group.support',
    items: [
      { route: '/help', labelKey: 'more.help' },
      { route: '/legal', labelKey: 'more.legal' },
      { route: '/about', labelKey: 'more.about' },
      { route: '/contact', labelKey: 'more.contact' },
    ],
  },
];

@Component({
  selector: 'app-more',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink],
  templateUrl: './more.html',
  styleUrl: './more.scss',
})
export class MorePage {
  readonly i18n = inject(I18n);
  readonly sections = computed(() => MORE_SECTIONS);
}
