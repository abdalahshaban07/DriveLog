import { buildAssistantContext, pickRuleBasedTip } from '../domain/assistant-context';
import type { Settings } from '../domain/models';
import type { Db } from './db';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export async function fetchChatCompletion(
  settings: Settings,
  messages: ChatMessage[],
): Promise<{ ok: true; text: string } | { ok: false; errorKey: string }> {
  if (!settings.assistantEnabled || !settings.assistantApiKey?.trim()) {
    return { ok: false, errorKey: 'assistant.disabled' };
  }
  const base = (settings.assistantBaseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, '');
  const model = settings.assistantModel?.trim() || DEFAULT_MODEL;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.assistantApiKey.trim()}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 512 }),
    });
    if (!res.ok) {
      return { ok: false, errorKey: 'assistant.httpError' };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, errorKey: 'assistant.empty' };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, errorKey: 'assistant.network' };
  }
}

export async function fetchFuelTip(db: Db): Promise<string> {
  const settings = db.settings();
  const context = buildAssistantContext({
    car: db.car(),
    settings,
    fills: db.fillUps(),
    maintenance: db.maintenance(),
    breakdowns: db.breakdowns(),
    other: db.otherExpenses(),
    periods: db.expensePeriods(),
    milestones: db.milestones(),
  });
  if (settings.assistantEnabled && settings.assistantApiKey?.trim()) {
    const result = await fetchChatCompletion(settings, [
      {
        role: 'system',
        content:
          'You are a concise fuel-economy coach. Reply with one actionable tip under 120 characters. No markdown.',
      },
      {
        role: 'user',
        content: `Car context JSON: ${JSON.stringify(context)}. Give one fuel-saving tip.`,
      },
    ]);
    if (result.ok) {
      return result.text;
    }
  }
  return pickRuleBasedTip();
}

export function assistantSystemPrompt(): string {
  return [
    'You are DriveLog assistant — a helpful car expense and maintenance coach.',
    'Answer briefly using only the user question and provided car context.',
    'Never ask for VIN, API keys, or personal identifiers.',
    'If data is missing, say what to log in the app.',
  ].join(' ');
}

export function buildChatMessages(
  db: Db,
  history: readonly ChatMessage[],
): ChatMessage[] {
  const context = buildAssistantContext({
    car: db.car(),
    settings: db.settings(),
    fills: db.fillUps(),
    maintenance: db.maintenance(),
    breakdowns: db.breakdowns(),
    other: db.otherExpenses(),
    periods: db.expensePeriods(),
    milestones: db.milestones(),
  });
  return [
    {
      role: 'system',
      content: `${assistantSystemPrompt()}\n\nContext:\n${JSON.stringify(context)}`,
    },
    ...history.filter((m) => m.role !== 'system'),
  ];
}
