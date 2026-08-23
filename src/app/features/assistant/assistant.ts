import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { buildChatMessages, fetchChatCompletion, type ChatMessage } from '../../data/assistant';
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

  readonly enabled = computed(
    () =>
      this.db.settings().assistantEnabled === true &&
      !!this.db.settings().assistantApiKey?.trim(),
  );

  askFaq(key: MsgKey): void {
    this.input.set(this.i18n.t(key));
    void this.send();
  }

  async send(): Promise<void> {
    const text = this.input().trim();
    if (!text || this.busy()) {
      return;
    }
    this.error.set('');
    if (!this.enabled()) {
      this.error.set(this.i18n.t('assistant.disabled'));
      return;
    }
    const nextHistory: ChatMessage[] = [...this.messages(), { role: 'user', content: text }];
    this.messages.set(nextHistory);
    this.input.set('');
    this.busy.set(true);
    try {
      const payload = buildChatMessages(this.db, nextHistory);
      const result = await fetchChatCompletion(this.db.settings(), payload);
      if (!result.ok) {
        this.error.set(this.i18n.t(result.errorKey as MsgKey));
        return;
      }
      this.messages.set([...nextHistory, { role: 'assistant', content: result.text }]);
    } finally {
      this.busy.set(false);
    }
  }
}
