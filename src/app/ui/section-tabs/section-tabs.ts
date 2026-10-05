import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';

export type SectionTab = {
  labelKey: MsgKey;
  link: string;
  exact?: boolean;
};

export const FUEL_TABS: SectionTab[] = [
  { labelKey: 'fuel.title', link: '/fuel' },
  { labelKey: 'nav.around', link: '/around' },
  { labelKey: 'section.history', link: '/history/fill-ups' },
];

@Component({
  selector: 'app-section-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './section-tabs.html',
})
export class SectionTabs {
  readonly i18n = inject(I18n);
  readonly tabs = input.required<SectionTab[]>();
  readonly ariaLabel = input.required<string>();
}
