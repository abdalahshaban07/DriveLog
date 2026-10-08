import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline, type ChatMessage } from '../../data/assistant';
import { Db } from '../../data/db';
import {
  ADVISOR_FAQ,
  advisorFaqVisible,
  faqSuggests,
  markFaqQuery,
  type AdvisorFaq,
  type AdvisorFaqGroup,
  type AnswerCard,
  type FaqMark,
} from '../../domain/advisor-card';
import {
  forcedAdvisorRead,
  readAdvisor,
  type AdvisorIntent,
  type AdvisorRead,
} from '../../domain/advisor-intent';
import { loadCoachInputs } from '../../domain/local-coach';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { CONTACT_EMAIL } from '../support/support';

type FaqGroup = {
  id: AdvisorFaqGroup;
  labelKey: MsgKey;
  items: AdvisorFaq[];
};

type ShownReply = {
  content: string;
  source: 'local' | 'remote';
  card?: AnswerCard;
};

@Component({
  selector: 'app-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink],
  templateUrl: './assistant.html',
  styleUrl: './assistant.scss',
})
export class AssistantPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');
  private readonly answerEl = viewChild<ElementRef<HTMLElement>>('answerEl');

  readonly query = signal('');
  readonly menuOpen = signal(true);
  readonly busy = signal(false);
  readonly reply = signal<ShownReply | null>(null);
  readonly statusKey = signal<MsgKey | null>(null);
  private readonly groupId = signal<AdvisorFaqGroup>('spend');
  /** Last answered intent, so "والزيت؟" can keep or shift that slot. */
  private readonly carry = signal<AdvisorRead | null>(null);
  private readonly turns = signal<ChatMessage[]>([]);

  readonly online = computed(() => isAssistantOnline(this.db));

  /** Questions the logs can actually answer, in three groups. */
  readonly faqGroups = computed((): FaqGroup[] => {
    const loaded = loadCoachInputs(this.db);
    if (!loaded) return [];
    const order = ['spend', 'car', 'budget'] as const;
    return order.flatMap((id) => {
      const items = ADVISOR_FAQ.filter(
        (item) => item.group === id && advisorFaqVisible(item, loaded.facts, loaded.logs),
      );
      if (!items.length) return [];
      return [{ id, labelKey: groupLabel(id), items }];
    });
  });

  /** An exact question in the field browses groups. A fragment searches every group. */
  readonly browsing = computed(() => {
    const q = this.query().trim();
    return !q || this.exactFaq() != null;
  });

  readonly activeGroup = computed((): AdvisorFaqGroup => {
    const groups = this.faqGroups();
    const wanted = this.groupId();
    if (groups.some((group) => group.id === wanted)) return wanted;
    return groups[0]?.id ?? 'spend';
  });

  readonly menuGroups = computed((): FaqGroup[] => {
    const groups = this.faqGroups();
    if (this.browsing()) {
      const id = this.activeGroup();
      const group = groups.find((item) => item.id === id);
      return group ? [group] : [];
    }
    const q = this.query();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => faqSuggests(item, this.i18n.t(item.key), q)),
      }))
      .filter((group) => group.items.length > 0);
  });

  readonly firstHitKey = computed(() => this.menuGroups()[0]?.items[0]?.key ?? null);

  readonly showFreeAsk = computed(() => {
    const q = this.query().trim();
    return q.length > 0 && this.exactFaq() == null && this.menuGroups().length === 0;
  });

  /** Play generative-AI policy: users must be able to flag AI output. */
  reportHref(content: string): string {
    const subject = encodeURIComponent('DriveLog: report AI response');
    const body = encodeURIComponent(content.slice(0, 500));
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  marks(item: AdvisorFaq): FaqMark[] {
    if (this.browsing()) return [{ text: this.i18n.t(item.key), mark: false }];
    return markFaqQuery(this.i18n.t(item.key), this.query());
  }

  onQuery(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.query.set(target.value);
    this.menuOpen.set(true);
  }

  pickGroup(id: AdvisorFaqGroup): void {
    this.groupId.set(id);
    this.menuOpen.set(true);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  clearQuery(): void {
    this.setQuery('');
    this.menuOpen.set(true);
    this.queryInput()?.nativeElement.focus();
  }

  clearAnswer(): void {
    this.reply.set(null);
    this.turns.set([]);
    this.statusKey.set(null);
    this.carry.set(null);
    this.setQuery('');
    this.menuOpen.set(true);
  }

  onEnter(): void {
    if (this.busy()) return;
    const exact = this.exactFaq();
    if (exact) {
      void this.sendFaq(exact);
      return;
    }
    const first = this.menuOpen() ? this.menuGroups()[0]?.items[0] : undefined;
    if (first) {
      void this.sendFaq(first);
      return;
    }
    void this.sendTyped();
  }

  async sendFaq(item: AdvisorFaq): Promise<void> {
    this.setQuery(this.i18n.t(item.key));
    this.menuOpen.set(false);
    this.blurQuery();
    await this.send(this.i18n.t(item.key), item.read.intent, item.read);
  }

  async sendTyped(): Promise<void> {
    const q = this.query().trim();
    if (!q || this.busy()) return;
    this.menuOpen.set(false);
    this.blurQuery();
    await this.send(q);
  }

  private setQuery(value: string): void {
    this.query.set(value);
    const input = this.queryInput()?.nativeElement;
    if (input && input.value !== value) input.value = value;
  }

  private exactFaq(): AdvisorFaq | null {
    const q = this.query().trim();
    if (!q) return null;
    for (const group of this.faqGroups()) {
      for (const item of group.items) {
        if (this.i18n.t(item.key) === q) return item;
      }
    }
    return null;
  }

  private blurQuery(): void {
    this.queryInput()?.nativeElement.blur();
  }

  private async send(
    question: string,
    intentHint?: AdvisorIntent,
    forced?: AdvisorRead,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.statusKey.set(null);
    this.reply.set(null);

    const read = forced ?? (intentHint
      ? forcedAdvisorRead(question, intentHint)
      : readAdvisor(question, this.carry()));
    if (read.intent !== 'UNSUPPORTED') this.carry.set(read);

    const history = this.turns();
    this.turns.update((list) => [...list, { role: 'user', content: question }]);

    try {
      const reply = await fetchChatReply(
        this.db,
        question,
        this.i18n.language(),
        (key, params) => this.i18n.t(key as MsgKey, params),
        intentHint,
        history,
        read,
        {
          amount: (value) => this.i18n.formatNumber(Math.round(value)),
          liters: (value) =>
            this.i18n.formatNumber(value, { maximumFractionDigits: 1, minimumFractionDigits: 0 }),
          date: (iso) => this.i18n.formatDate(iso, { day: 'numeric', month: 'short' }),
        },
      );

      if (forced || reply.card) {
        this.statusKey.set(null);
      } else if (reply.remoteFailed) {
        this.statusKey.set('assistant.network');
      } else if (!this.online()) {
        this.statusKey.set('assistant.localOnly');
      } else if (reply.source === 'remote') {
        this.statusKey.set('assistant.sourceRemote');
      } else {
        this.statusKey.set(null);
      }

      this.turns.update((list) => [
        ...list,
        { role: 'assistant', content: reply.text },
      ]);
      this.reply.set({
        content: reply.text,
        source: reply.source,
        card: reply.card,
      });
      this.scrollAnswer();
    } finally {
      this.busy.set(false);
    }
  }

  private scrollAnswer(): void {
    requestAnimationFrame(() => {
      const reduce =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.answerEl()?.nativeElement.scrollIntoView({
        block: 'nearest',
        behavior: reduce ? 'auto' : 'smooth',
      });
    });
  }
}

function groupLabel(id: AdvisorFaqGroup): MsgKey {
  switch (id) {
    case 'spend':
      return 'assistant.group.spend';
    case 'car':
      return 'assistant.group.car';
    case 'budget':
      return 'assistant.group.budget';
    default: {
      const _e: never = id;
      return _e;
    }
  }
}
