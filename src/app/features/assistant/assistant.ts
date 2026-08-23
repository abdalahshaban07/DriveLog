import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { fetchChatReply, type ChatMessage } from '../../data/assistant';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, TextField, PrimaryButton],
  templateUrl: './assistant.html',
  styleUrl: './assistant.scss',
})
export class AssistantPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly input = signal('');
  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly faqKeys: MsgKey[] = [
    'assistant.faq.economy',
    'assistant.faq.period',
    'assistant.faq.maintenance',
    'assistant.faq.breakdown',
  ];

  askFaq(key: MsgKey): void {
    this.input.set(this.i18n.t(key));
    void this.send();
  }

  clearChat(): void {
    this.messages.set([]);
    this.error.set('');
  }

  async send(): Promise<void> {
    const text = this.input().trim();
    if (!text || this.busy()) {
      return;
    }
    this.error.set('');
    const nextHistory: ChatMessage[] = [...this.messages(), { role: 'user', content: text }];
    this.messages.set(nextHistory);
    this.input.set('');
    this.busy.set(true);
    try {
      const reply = await fetchChatReply(this.db, text, this.i18n.language(), (k, p) =>
        this.i18n.t(k as MsgKey, p),
      );
      this.messages.set([...nextHistory, { role: 'assistant', content: reply }]);
    } catch {
      this.error.set(this.i18n.t('assistant.network'));
    } finally {
      this.busy.set(false);
    }
  }
}
