import {
  fetchCoachReply,
  fetchFuelTipText,
} from '../domain/local-coach';
import type { Db } from './db';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function fetchFuelTip(
  db: Db,
  lang: 'en' | 'ar',
  t: (key: string) => string,
): Promise<string> {
  return fetchFuelTipText(db, lang, t as (key: string) => string);
}

export async function fetchChatReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: (key: string, params?: Record<string, string | number>) => string,
): Promise<string> {
  return fetchCoachReply(db, question, lang, t as typeof t);
}
