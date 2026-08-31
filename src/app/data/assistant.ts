import {
  fetchCoachReply,
  fetchFuelTipText,
  type CoachReply,
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
): Promise<CoachReply> {
  return fetchFuelTipText(db, lang, t as (key: string) => string);
}

export async function fetchChatReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: (key: string, params?: Record<string, string | number>) => string,
): Promise<CoachReply> {
  return fetchCoachReply(db, question, lang, t as typeof t);
}
