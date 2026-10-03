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
import { PrimaryButton } from '../../ui/primary-button';
import { SectionTabs, type SectionTab } from '../../ui/section-tabs/section-tabs';

export type SupportDoc = 'help' | 'legal' | 'about' | 'contact';
export type ContactTopic = 'feature' | 'issue' | 'other';

export const CONTACT_EMAIL = 'abdalahshaban129@gmail.com';

export const CONTACT_TOPICS: readonly {
  value: ContactTopic;
  labelKey: MsgKey;
  bodyKey: MsgKey;
}[] = [
  { value: 'feature', labelKey: 'contact.topic.feature', bodyKey: 'contact.topic.feature.body' },
  { value: 'issue', labelKey: 'contact.topic.issue', bodyKey: 'contact.topic.issue.body' },
  { value: 'other', labelKey: 'contact.topic.other', bodyKey: 'contact.topic.other.body' },
];

export type FaqGroupId = 'data' | 'log' | 'care' | 'look';
export type FaqGo = 'settings' | 'fillUp' | 'maint' | 'around' | 'assistant' | 'vault';

export type FaqItem = {
  q: MsgKey;
  a: MsgKey;
  group: FaqGroupId;
  steps?: readonly MsgKey[];
  go?: FaqGo;
};

export const FAQ_GROUPS: readonly { id: FaqGroupId; labelKey: MsgKey }[] = [
  { id: 'data', labelKey: 'help.group.data' },
  { id: 'log', labelKey: 'help.group.log' },
  { id: 'care', labelKey: 'help.group.care' },
  { id: 'look', labelKey: 'help.group.look' },
];

export const FAQ_GO: Record<FaqGo, { labelKey: MsgKey; link: string }> = {
  settings: { labelKey: 'help.go.settings', link: '/settings' },
  fillUp: { labelKey: 'help.go.fillUp', link: '/fill-up' },
  maint: { labelKey: 'help.go.maint', link: '/maintenance' },
  around: { labelKey: 'help.go.around', link: '/around' },
  assistant: { labelKey: 'help.go.assistant', link: '/assistant' },
  vault: { labelKey: 'help.go.vault', link: '/vault' },
};

export const HELP_FAQ: readonly FaqItem[] = [
  {
    q: 'help.q.data',
    a: 'help.a.data',
    group: 'data',
    steps: ['help.s.data.1', 'help.s.data.2'],
    go: 'settings',
  },
  {
    q: 'help.q.backup',
    a: 'help.a.backup',
    group: 'data',
    steps: ['help.s.backup.1', 'help.s.backup.2'],
    go: 'settings',
  },
  {
    q: 'help.q.reset',
    a: 'help.a.reset',
    group: 'data',
    steps: ['help.s.reset.1', 'help.s.reset.2'],
    go: 'settings',
  },
  {
    q: 'help.q.fillUp',
    a: 'help.a.fillUp',
    group: 'log',
    steps: ['help.s.fill.1', 'help.s.fill.2', 'help.s.fill.3'],
    go: 'fillUp',
  },
  {
    q: 'help.q.tank',
    a: 'help.a.tank',
    group: 'log',
    steps: ['help.s.tank.1', 'help.s.tank.2'],
    go: 'settings',
  },
  {
    q: 'help.q.maint',
    a: 'help.a.maint',
    group: 'log',
    steps: ['help.s.maint.1', 'help.s.maint.2', 'help.s.maint.3'],
    go: 'maint',
  },
  {
    q: 'help.q.reminders',
    a: 'help.a.reminders',
    group: 'care',
    steps: ['help.s.remind.1', 'help.s.remind.2'],
    go: 'settings',
  },
  {
    q: 'help.q.vault',
    a: 'help.a.vault',
    group: 'care',
    steps: ['help.s.vault.1', 'help.s.vault.2'],
    go: 'vault',
  },
  {
    q: 'help.q.advisor',
    a: 'help.a.advisor',
    group: 'care',
    steps: ['help.s.advisor.1', 'help.s.advisor.2'],
    go: 'assistant',
  },
  {
    q: 'help.q.appearance',
    a: 'help.a.appearance',
    group: 'look',
    steps: ['help.s.look.1', 'help.s.look.2'],
    go: 'settings',
  },
  {
    q: 'help.q.around',
    a: 'help.a.around',
    group: 'look',
    steps: ['help.s.around.1', 'help.s.around.2'],
    go: 'around',
  },
  {
    q: 'help.q.install',
    a: 'help.a.install',
    group: 'look',
    steps: ['help.s.install.1', 'help.s.install.2'],
  },
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
  { labelKey: 'support.tab.contact', link: '/contact' },
];

export function parseSupportDoc(raw: unknown): SupportDoc {
  if (raw === 'help' || raw === 'legal' || raw === 'about' || raw === 'contact') {
    return raw;
  }
  return 'about';
}

@Component({
  selector: 'app-support',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, SectionTabs, PrimaryButton],
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
  readonly contactTopics = CONTACT_TOPICS;
  readonly doc = parseSupportDoc(inject(ActivatedRoute).snapshot.data['doc']);

  readonly openFaq = signal<MsgKey | null>(null);
  readonly reachedEnd = signal(false);
  readonly contactTopic = signal<ContactTopic>('feature');
  readonly query = signal('');
  readonly faqDest = FAQ_GO;
  private readonly legalEnd = viewChild<ElementRef<HTMLElement>>('legalEnd');

  readonly faqGroups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const items = this.faq.filter((item) => {
      if (!q) {
        return true;
      }
      const blob = [item.q, item.a, ...(item.steps ?? [])]
        .map((key) => this.i18n.t(key))
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
    return FAQ_GROUPS.map((group) => ({
      ...group,
      items: items.filter((item) => item.group === group.id),
    })).filter((group) => group.items.length > 0);
  });

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
      case 'contact':
        return 'contact.title';
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
      case 'contact':
        return 'contact.lead';
      default: {
        const _never: never = this.doc;
        return _never;
      }
    }
  }

  onContactTopic(value: ContactTopic): void {
    this.contactTopic.set(value);
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  countLabel(): string {
    return this.padIndex(this.i18n.formatNumber(this.faq.length));
  }

  faqIndex(q: MsgKey): string {
    const n = this.faq.findIndex((item) => item.q === q) + 1;
    return this.padIndex(this.i18n.formatNumber(n));
  }

  private padIndex(formatted: string): string {
    if (formatted.length >= 2) {
      return formatted;
    }
    const zero = /[0-9]/.test(formatted) ? '0' : '٠';
    return `${zero}${formatted}`;
  }

  contactMailto(): string {
    const topic = this.contactTopic();
    let subjectKey: MsgKey;
    switch (topic) {
      case 'feature':
        subjectKey = 'contact.subject.feature';
        break;
      case 'issue':
        subjectKey = 'contact.subject.issue';
        break;
      case 'other':
        subjectKey = 'contact.subject.other';
        break;
      default: {
        const _never: never = topic;
        return _never;
      }
    }
    const subject = encodeURIComponent(this.i18n.t(subjectKey));
    return `mailto:${CONTACT_EMAIL}?subject=${subject}`;
  }

  openMailto(): void {
    window.location.href = this.contactMailto();
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
