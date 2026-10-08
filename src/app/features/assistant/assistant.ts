import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline, type ChatMessage } from '../../data/assistant';
import { Db } from '../../data/db';
import {
  ADVISOR_FAQ,
  advisorFaqVisible,
  type AdvisorFaq,
  type AdvisorFaqGroup,
  type AnswerCard,
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
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { CONTACT_EMAIL } from '../support/support';

type FaqGroup = {
  id: AdvisorFaqGroup;
  labelKey: MsgKey;
  items: AdvisorFaq[];
};

type UiMessage = {
  role: 'user' | 'assistant';
  content: string;
  source?: 'local' | 'remote';
  card?: AnswerCard;
};

@Component({
  selector: 'app-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, TextField, PrimaryButton, RouterLink],
  templateUrl: './assistant.html',
  styleUrl: './assistant.scss',
})
export class AssistantPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly draft = signal('');
  readonly busy = signal(false);
  readonly messages = signal<UiMessage[]>([]);
  readonly questionsOpen = signal(true);
  readonly statusKey = signal<MsgKey | null>(null);
  /** Last answered intent, so "والزيت؟" can keep or shift that slot. */
  private readonly carry = signal<AdvisorRead | null>(null);

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
      const labelKey = groupLabel(id);
      return [{ id, labelKey, items }];
    });
  });

  /** Play generative-AI policy: users must be able to flag AI output. */
  reportHref(content: string): string {
    const subject = encodeURIComponent('DriveLog: report AI response');
    const body = encodeURIComponent(content.slice(0, 500));
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  clearChat(): void {
    this.messages.set([]);
    this.statusKey.set(null);
    this.carry.set(null);
    this.questionsOpen.set(true);
  }

  async sendFaq(item: AdvisorFaq): Promise<void> {
    await this.send(this.i18n.t(item.key), item.read.intent, item.read);
  }

  async sendTyped(): Promise<void> {
    const q = this.draft().trim();
    if (!q || this.busy()) return;
    this.draft.set('');
    await this.send(q);
  }

  private async send(
    question: string,
    intentHint?: AdvisorIntent,
    forced?: AdvisorRead,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.statusKey.set(null);
    this.questionsOpen.set(false);

    const read = forced ?? (intentHint
      ? forcedAdvisorRead(question, intentHint)
      : readAdvisor(question, this.carry()));
    if (read.intent !== 'UNSUPPORTED') this.carry.set(read);

    const history: ChatMessage[] = this.messages().map((m) => ({
      role: m.role,
      content: m.content,
    }));

    this.messages.update((list) => [...list, { role: 'user', content: question }]);
    this.scrollToLatest();

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

      if (forced) {
        this.statusKey.set(null);
      } else if (reply.source === 'local' && this.online()) {
        this.statusKey.set('assistant.network');
      } else if (!this.online()) {
        this.statusKey.set('assistant.localOnly');
      } else {
        this.statusKey.set('assistant.sourceRemote');
      }

      this.messages.update((list) => [
        ...list,
        {
          role: 'assistant',
          content: reply.text,
          source: reply.source,
          card: reply.card,
        },
      ]);
      this.scrollToLatest();
    } finally {
      this.busy.set(false);
      this.scrollToLatest();
    }
  }

  /** ponytail: double rAF so Angular paints; scrollIntoView works whichever ancestor scrolls */
  private scrollToLatest(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const reduce =
          typeof matchMedia === 'function' &&
          matchMedia('(prefers-reduced-motion: reduce)').matches;
        const end = this.host.nativeElement.querySelector('[data-chat-end]');
        if (end instanceof HTMLElement) {
          end.scrollIntoView({
            block: 'end',
            behavior: reduce ? 'auto' : 'smooth',
          });
        }
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
