import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';

export type MoreIcon =
  | 'settings'
  | 'alert'
  | 'receipt'
  | 'vault'
  | 'passport'
  | 'pulse'
  | 'budget'
  | 'spark'
  | 'checklist'
  | 'help'
  | 'mail';

export type MoreTone = 'fuel' | 'mint' | 'stop' | 'ink';

export type MoreLayout = 'feature' | 'list' | 'duo';

type MoreLink = {
  route: string;
  labelKey: MsgKey;
  hintKey: MsgKey;
  icon: MoreIcon;
  tone: MoreTone;
};

export type MoreSection = {
  headingKey: MsgKey;
  layout: MoreLayout;
  items: readonly MoreLink[];
};

const MORE_ICONS: Record<MoreIcon, readonly string[]> = {
  settings: [
    'M4 8h16',
    'M4 16h16',
    'M9.8 8a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0',
    'M17.8 16a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0',
  ],
  alert: ['M12 3.8 21 19.2H3z', 'M12 9.4v4.4', 'M12 16.6v.4'],
  receipt: ['M7 3.5h10V20l-2.5-1.4L12 20l-2.5-1.4L7 20z', 'M9.5 8h5', 'M9.5 12h5'],
  vault: [
    'M6 10.5h12v8.5H6z',
    'M9 10.5V8.2A3 3 0 0 1 12 5.2 3 3 0 0 1 15 8.2v2.3',
    'M12 13.4v2.2',
  ],
  passport: ['M4 6h16v12H4z', 'M8 10h4.5', 'M8 13.5h6', 'M16.6 11.2a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0'],
  pulse: ['M3 12h3.2l2.1-4.2 3.2 8.4 2.2-4.2H21'],
  budget: ['M5 19V11', 'M12 19V6', 'M19 19v-6', 'M4 19.5h16'],
  spark: [
    'M12 3.2 13.4 8 18.2 9.4 13.4 10.8 12 15.6 10.6 10.8 5.8 9.4 10.6 8z',
    'M18 14.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  ],
  checklist: ['M9 7h10', 'M9 12h10', 'M9 17h10', 'M4.2 7.2l1.3 1.3 2.2-2.4', 'M4.2 12.2l1.3 1.3 2.2-2.4', 'M4.2 17.2l1.3 1.3 2.2-2.4'],
  help: [
    'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z',
    'M9.6 9.5a2.4 2.4 0 0 1 4.6 1c0 1.6-2.2 1.9-2.2 3.2',
    'M12 16.8v.4',
  ],
  mail: ['M4 7h16v10H4z', 'M4 7.5 12 13l8-5.5'],
};

export function moreIconPaths(icon: MoreIcon): readonly string[] {
  return MORE_ICONS[icon];
}

export const MORE_SECTIONS: readonly MoreSection[] = [
  {
    headingKey: 'more.group.app',
    layout: 'feature',
    items: [
      {
        route: '/settings',
        labelKey: 'more.settings',
        hintKey: 'more.settings.hint',
        icon: 'settings',
        tone: 'fuel',
      },
    ],
  },
  {
    headingKey: 'more.group.logs',
    layout: 'list',
    items: [
      {
        route: '/breakdowns',
        labelKey: 'more.breakdowns',
        hintKey: 'more.breakdowns.hint',
        icon: 'alert',
        tone: 'stop',
      },
      {
        route: '/other-expenses',
        labelKey: 'more.otherExpenses',
        hintKey: 'more.otherExpenses.hint',
        icon: 'receipt',
        tone: 'fuel',
      },
      {
        route: '/vault',
        labelKey: 'more.vault',
        hintKey: 'more.vault.hint',
        icon: 'vault',
        tone: 'ink',
      },
      {
        route: '/passport',
        labelKey: 'more.passport',
        hintKey: 'more.passport.hint',
        icon: 'passport',
        tone: 'fuel',
      },
    ],
  },
  {
    headingKey: 'more.group.tools',
    layout: 'list',
    items: [
      {
        route: '/health',
        labelKey: 'more.health',
        hintKey: 'more.health.hint',
        icon: 'pulse',
        tone: 'mint',
      },
      {
        route: '/budget',
        labelKey: 'more.budget',
        hintKey: 'more.budget.hint',
        icon: 'budget',
        tone: 'fuel',
      },
      {
        route: '/assistant',
        labelKey: 'more.assistant',
        hintKey: 'more.assistant.hint',
        icon: 'spark',
        tone: 'mint',
      },
      {
        route: '/pre-trip',
        labelKey: 'more.preTrip',
        hintKey: 'more.preTrip.hint',
        icon: 'checklist',
        tone: 'fuel',
      },
    ],
  },
  {
    headingKey: 'more.group.support',
    layout: 'duo',
    items: [
      {
        route: '/help',
        labelKey: 'more.help',
        hintKey: 'more.help.hint',
        icon: 'help',
        tone: 'ink',
      },
      {
        route: '/contact',
        labelKey: 'more.contact',
        hintKey: 'more.contact.hint',
        icon: 'mail',
        tone: 'mint',
      },
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
  private readonly db = inject(Db);
  readonly sections = computed(() => MORE_SECTIONS);

  readonly carLine = computed(() => {
    const car = this.db.car();
    if (!car) {
      return '';
    }
    const plate = car.plate?.trim();
    return plate ? `${car.nickname} · ${plate}` : car.nickname;
  });

  iconPaths(icon: MoreIcon): readonly string[] {
    return moreIconPaths(icon);
  }

  sectionIndex(index: number): string {
    const n = this.i18n.formatNumber(index + 1);
    const zero = this.i18n.language() === 'ar' ? '٠' : '0';
    return n.length >= 2 ? n : `${zero}${n}`;
  }
}
