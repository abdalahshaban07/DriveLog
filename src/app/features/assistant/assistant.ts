import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  fetchChatReply,
  isAssistantOnline,
  type ChatMessage,
} from '../../data/assistant';
import { Db } from '../../data/db';
import { intentFromFaqKey } from '../../domain/advisor-intent';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { CONTACT_EMAIL } from '../support/support';

const FAQ_KEYS = [
  'assistant.faq.economy',
  'assistant.faq.period',
  'assistant.faq.maintenance',
  'assistant.faq.breakdown',
] as const satisfies readonly MsgKey[];

type UiMessage = {
  role: 'user' | 'assistant';
  content: string;
  source?: 'local' | 'remote';
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
  readonly statusKey = signal<MsgKey | null>(null);

  readonly online = computed(() => isAssistantOnline(this.db));
  /** Only suggest questions the car's logs can actually answer. */
  readonly faqKeys = computed(() => {
    const has: Record<(typeof FAQ_KEYS)[number], boolean> = {
      'assistant.faq.economy': this.db.fillUps().length >= 2,
      'assistant.faq.period': true,
      'assistant.faq.maintenance': this.db.maintenance().length > 0,
      'assistant.faq.breakdown': this.db.breakdowns().length > 0,
    };
    return FAQ_KEYS.filter((k) => has[k]);
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
  }

  async sendFaq(key: MsgKey): Promise<void> {
    const text = this.i18n.t(key);
    await this.send(text, intentFromFaqKey(key));
  }

  async sendTyped(): Promise<void> {
    const q = this.draft().trim();
    if (!q || this.busy()) return;
    this.draft.set('');
    await this.send(q);
  }

  private async send(
    question: string,
    intentHint?: ReturnType<typeof intentFromFaqKey>,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.statusKey.set(null);

    const history: ChatMessage[] = this.messages().map((m) => ({
      role: m.role,
      content: m.content,
    }));

    this.messages.update((list) => [
      ...list,
      { role: 'user', content: question },
    ]);
    this.scrollToLatest();

    try {
      const reply = await fetchChatReply(
        this.db,
        question,
        this.i18n.language(),
        (key, params) => this.i18n.t(key as MsgKey, params),
        intentHint,
        history,
      );

      if (reply.source === 'local' && this.online()) {
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
