import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { APP_VERSION } from '../../core/config';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';

export type SupportDoc = 'help' | 'legal' | 'about';

export const HELP_FAQ: readonly { q: MsgKey; a: MsgKey }[] = [
  { q: 'help.q.data', a: 'help.a.data' },
  { q: 'help.q.fillUp', a: 'help.a.fillUp' },
  { q: 'help.q.tank', a: 'help.a.tank' },
  { q: 'help.q.backup', a: 'help.a.backup' },
  { q: 'help.q.reminders', a: 'help.a.reminders' },
  { q: 'help.q.appearance', a: 'help.a.appearance' },
  { q: 'help.q.around', a: 'help.a.around' },
  { q: 'help.q.reset', a: 'help.a.reset' },
];

export const LEGAL_SECTIONS: readonly {
  id: string;
  headingKey: MsgKey;
  bodyKeys: readonly MsgKey[];
}[] = [
  {
    id: 'legal-privacy',
    headingKey: 'legal.privacyHeading',
    bodyKeys: ['legal.privacy.p1', 'legal.privacy.p2', 'legal.privacy.p3'],
  },
  {
    id: 'legal-terms',
    headingKey: 'legal.termsHeading',
    bodyKeys: ['legal.terms.p1', 'legal.terms.p2', 'legal.terms.p3'],
  },
];

export const SUPPORT_TABS: SectionTab[] = [
  { labelKey: 'support.tab.help', link: '/help' },
  { labelKey: 'support.tab.legal', link: '/legal' },
  { labelKey: 'support.tab.about', link: '/about' },
];

export function parseSupportDoc(raw: unknown): SupportDoc {
  if (raw === 'help' || raw === 'legal' || raw === 'about') {
    return raw;
  }
  return 'about';
}

@Component({
  selector: 'app-support',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, SectionTabs],
  templateUrl: './support.html',
  styleUrl: './support.scss',
})
export class SupportPage {
  readonly i18n = inject(I18n);
  readonly router = inject(Router);
  readonly version = APP_VERSION;
  readonly faq = HELP_FAQ;
  readonly legal = LEGAL_SECTIONS;
  readonly tabs = SUPPORT_TABS;
  readonly doc = parseSupportDoc(inject(ActivatedRoute).snapshot.data['doc']);

  readonly openFaq = signal<MsgKey | null>(null);
  readonly reachedEnd = signal(false);
  private readonly legalEnd = viewChild<ElementRef<HTMLElement>>('legalEnd');

  readonly faqStatus = computed(() => {
    const q = this.openFaq();
    if (!q) {
      return this.i18n.t('help.status.closed');
    }
    return this.i18n.t('help.status.open', { q: this.i18n.t(q) });
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (this.doc !== 'legal') {
        return;
      }
      const node = this.legalEnd()?.nativeElement;
      if (!node || typeof IntersectionObserver === 'undefined') {
        return;
      }
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            this.reachedEnd.set(true);
          }
        },
        { threshold: 0.55 },
      );
      io.observe(node);
      destroyRef.onDestroy(() => io.disconnect());
    });
  }

  titleKey(): MsgKey {
    switch (this.doc) {
      case 'help':
        return 'help.title';
      case 'legal':
        return 'legal.title';
      case 'about':
        return 'about.title';
      default: {
        const _never: never = this.doc;
        return _never;
      }
    }
  }

  subtitleText(): string {
    const key = this.subtitleKey();
    return key ? this.i18n.t(key) : '';
  }

  subtitleKey(): MsgKey | '' {
    switch (this.doc) {
      case 'help':
        return 'help.lead';
      case 'legal':
        return 'legal.lead';
      case 'about':
        return 'about.lead';
      default: {
        const _never: never = this.doc;
        return _never;
      }
    }
  }

  onFaqToggle(q: MsgKey, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open) {
      this.openFaq.set(q);
      return;
    }
    if (this.openFaq() === q) {
      this.openFaq.set(null);
    }
  }

  onJump(event: Event, id: string): void {
    event.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    });
  }
}
