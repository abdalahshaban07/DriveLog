import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { WhatsNew } from '../../pwa/whats-new';
import { PageHeader } from '../../ui/page-header';

type MoreAction = 'whatsNew';

type MoreLink = { kind: 'link'; route: string; labelKey: MsgKey };
type MoreButton = { kind: 'action'; action: MoreAction; labelKey: MsgKey };
type MoreItem = MoreLink | MoreButton;

export type MoreSection = {
  headingKey: MsgKey;
  items: readonly MoreItem[];
};

export const MORE_SECTIONS: readonly MoreSection[] = [
  {
    headingKey: 'more.group.app',
    items: [
      { kind: 'link', route: '/settings', labelKey: 'more.settings' },
      { kind: 'link', route: '/settings/features', labelKey: 'settings.features' },
      { kind: 'link', route: '/settings/types', labelKey: 'more.maintenanceTypes' },
      { kind: 'action', action: 'whatsNew', labelKey: 'more.whatsNew' },
    ],
  },
  {
    headingKey: 'more.group.logs',
    items: [
      { kind: 'link', route: '/history/fill-ups', labelKey: 'more.fillUpHistory' },
      { kind: 'link', route: '/history/maintenance', labelKey: 'more.maintHistory' },
      { kind: 'link', route: '/breakdowns', labelKey: 'more.breakdowns' },
      { kind: 'link', route: '/other-expenses', labelKey: 'more.otherExpenses' },
    ],
  },
  {
    headingKey: 'more.group.tools',
    items: [{ kind: 'link', route: '/assistant', labelKey: 'more.assistant' }],
  },
  {
    headingKey: 'more.group.support',
    items: [
      { kind: 'link', route: '/help', labelKey: 'more.help' },
      { kind: 'link', route: '/legal', labelKey: 'more.legal' },
      { kind: 'link', route: '/about', labelKey: 'more.about' },
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
  private readonly whatsNew = inject(WhatsNew);

  readonly sections = computed(() => MORE_SECTIONS);

  onAction(action: MoreAction): void {
    switch (action) {
      case 'whatsNew':
        this.whatsNew.openManual();
        return;
      default: {
        const _never: never = action;
        return _never;
      }
    }
  }
}
