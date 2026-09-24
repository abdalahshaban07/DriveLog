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
import { intentFromFaqKey } from '../../domain/local-coach';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

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
  readonly faqKeys = FAQ_KEYS;

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
    }
  }

  private scrollToLatest(): void {
    queueMicrotask(() => {
      const end = this.host.nativeElement.querySelector('[data-chat-end]');
      if (!(end instanceof HTMLElement)) {
        return;
      }
      const reduce =
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      end.scrollIntoView({
        block: 'nearest',
        behavior: reduce ? 'auto' : 'smooth',
      });
    });
  }
}
