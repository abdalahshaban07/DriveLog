import { buildDueItems, todayDateOnly } from '../domain/dues';
import { buildUpcoming, type UpcomingItem } from '../domain/upcoming';
import {
  bumpFreeLlmCursor,
  freeGatewaysFrom,
  readFreeLlmCursor,
  ASSISTANT_THINKING_MAX_TOKENS,
} from '../domain/free-llm-gateways';
import { dueItemLabel } from '../domain/part-name';
import {
  firstSentence,
  pageLineFact,
  pageLineSentence,
  rewriteKeepsFacts,
  type PageLineBag,
  type PageLineId,
} from '../domain/page-line';
import { remainingMonthlyMaintenanceBudget } from '../domain/budget-engine';
import { vaultExpiryForKind } from '../domain/vehicle-docs';
import type { MsgKey } from '../i18n/en';
import type { Maintenance, PartDefinition, PreTripCheck, VehicleDocument } from '../domain/models';
import { canRemoteAssistantCall, recordRemoteAssistantCall } from './assistant-rate-limit';
import { isAssistantOnline, usableCoachText } from './assistant';
import type { Db } from './db';
import { fetchOpenAiChat, OpenAiChatError } from './openai-chat';

const CACHE_KEY = 'drivelog.page-line.v1';
const TIMEOUT_MS = 8_000;
const THINKING_TIMEOUT_MS = 15_000;

type CacheEntry = { day: string; text: string };

export function pageLineBag(
  db: Db,
  t: (key: string, params?: Record<string, string | number>) => string,
  report: PageLineReport,
): PageLineBag {
  const car = db.car();
  const settings = db.settings();
  const docs = db.vehicleDocuments();
  const maintenance = db.maintenance();
  const parts = db.catalog();
  const today = todayDateOnly();
  const license = vaultExpiryForKind(docs, 'license') ?? car?.licenseExpiry;
  const registration = vaultExpiryForKind(docs, 'registration') ?? car?.registrationExpiry;
  return {
    today,
    currency: settings.currency,
    fills: db.fillUps(),
    maintenance,
    breakdowns: db.breakdowns(),
    licenseExpiry: license,
    insuranceExpiry: earliestExpiry(docs, 'insurance'),
    tireCheckedOn: latestTireCheck(db.preTripChecks()),
    odometer: car?.currentOdometer ?? 0,
    dues: car
      ? buildDueItems(
          settings,
          maintenance,
          car.currentOdometer,
          today,
          license ? { ...car, licenseExpiry: license } : car,
        )
      : [],
    upcoming: car
      ? buildUpcoming({
          maintenance,
          documents: docs,
          odometer: car.currentOdometer,
          licenseExpiry: license,
          registrationExpiry: registration,
          today,
        }).map((item) => ({
          status: item.status,
          label: upcomingLabel(item, maintenance, parts, t),
        }))
      : [],
    reportFuel: report.fuel,
    reportMaint: report.maintenance,
    reportTotal: report.total,
    budgetRemaining: car
      ? remainingMonthlyMaintenanceBudget(car, maintenance, settings.currency, today)
      : null,
    labelDue: (item) => dueItemLabel(item, maintenance, parts, t),
    labelMaint: (row) => maintLabel(row, parts, t),
  };
}

export function localPageLine(
  page: PageLineId,
  bag: PageLineBag,
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
  lang: 'en' | 'ar',
): string | null {
  const fact = pageLineFact(page, bag);
  if (!fact) return null;
  const message = pageLineSentence(fact, lang);
  return t(message.key, message.params);
}

/**
 * One free model, once per page per day. The local sentence stays when the
 * model is off, offline, capped, or unusable.
 * ponytail: unit tests set VITEST, so they never call the gateway.
 */
export async function polishPageLine(input: {
  db: Db;
  page: PageLineId;
  source: string;
  lang: 'en' | 'ar';
  day: string;
  signal?: AbortSignal;
}): Promise<string> {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const cached = readCached(storage, input.page, input.lang, input.day);
  if (cached) return cached;

  const skip = inUnitTest();
  if (
    skip ||
    !isAssistantOnline(input.db) ||
    !browserOnline() ||
    !canRemoteAssistantCall(storage)
  ) {
    if (!skip && isAssistantOnline(input.db) && browserOnline() && !canRemoteAssistantCall(storage)) {
      writeCached(storage, input.page, input.lang, input.day, input.source);
    }
    return input.source;
  }

  const gw = freeGatewaysFrom(readFreeLlmCursor(storage))[0];
  bumpFreeLlmCursor(storage);
  if (!gw) return input.source;

  const thinking = gw.id === 'llm7-glm';
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  input.signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(
    () => controller.abort(),
    thinking ? THINKING_TIMEOUT_MS : TIMEOUT_MS,
  );
  try {
    const raw = await fetchOpenAiChat({
      baseUrl: gw.baseUrl,
      model: gw.model,
      messages: [
        { role: 'system', content: systemPrompt(input.lang) },
        { role: 'user', content: input.source },
      ],
      maxTokens: thinking ? ASSISTANT_THINKING_MAX_TOKENS : 80,
      reasoningEffort: thinking ? 'low' : undefined,
      signal: controller.signal,
    });
    recordRemoteAssistantCall(storage);
    const text = usableCoachText(raw, input.lang);
    const line = text ? firstSentence(text) : '';
    const next = line && rewriteKeepsFacts(input.source, line) ? line : input.source;
    writeCached(storage, input.page, input.lang, input.day, next);
    return next;
  } catch (err) {
    if (input.signal?.aborted) return input.source;
    if (err instanceof OpenAiChatError && err.status != null) recordRemoteAssistantCall(storage);
    writeCached(storage, input.page, input.lang, input.day, input.source);
    return input.source;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}

function systemPrompt(lang: 'en' | 'ar'): string {
  return lang === 'ar'
    ? 'أعد كتابة الجملة بالعربية المصرية في سطر واحد هادي. خلّي نفس المعلومة. ممنوع تضيف أرقام أو أسعار أو أماكن أو نصيحة مش في الجملة. ممنوع تقول إن محطات البنزين أسعارها مختلفة. ارد بالجملة فقط.'
    : 'Rewrite the sentence in the same language as one short calm line. Keep the same facts. Do not add numbers, prices, places, or advice that are not in the sentence. Never say fuel stations charge different prices. Reply with the sentence only.';
}

function inUnitTest(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.['VITEST'] === 'true';
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function cacheSlot(page: PageLineId, lang: 'en' | 'ar'): string {
  return `${page}:${lang}`;
}

function readCached(
  storage: Storage | null,
  page: PageLineId,
  lang: 'en' | 'ar',
  day: string,
): string | null {
  const entry = readAll(storage)[cacheSlot(page, lang)];
  return entry?.day === day && entry.text ? entry.text : null;
}

function writeCached(
  storage: Storage | null,
  page: PageLineId,
  lang: 'en' | 'ar',
  day: string,
  text: string,
): void {
  if (!storage) return;
  try {
    const all = readAll(storage);
    all[cacheSlot(page, lang)] = { day, text };
    storage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // private mode / quota
  }
}

function readAll(storage: Storage | null): Record<string, CacheEntry> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function earliestExpiry(
  docs: readonly VehicleDocument[],
  kind: VehicleDocument['kind'],
): string | undefined {
  const dates = docs.filter((d) => d.kind === kind).map((d) => d.expiryDate).sort();
  return dates[0];
}

function latestTireCheck(checks: readonly PreTripCheck[]): string | undefined {
  const dates = checks.filter((c) => c.items.tires).map((c) => c.date).sort();
  return dates[dates.length - 1];
}

export type PageLineReport = { fuel: number; maintenance: number; total: number };

function upcomingLabel(
  item: UpcomingItem,
  maintenance: readonly Maintenance[],
  parts: readonly PartDefinition[],
  t: (key: string) => string,
): string {
  if (item.maintenanceId) {
    const row = maintenance.find((entry) => entry.id === item.maintenanceId);
    if (row) return maintLabel(row, parts, t);
  }
  if (!item.docKind) return '';
  if (item.docKind === 'other') return item.docLabel?.trim() || t('vault.kind.other');
  switch (item.docKind) {
    case 'license':
      return t('vault.kind.license');
    case 'registration':
      return t('vault.kind.registration');
    case 'insurance':
      return t('vault.kind.insurance');
    case 'inspection':
      return t('vault.kind.inspection');
    default: {
      const _never: never = item.docKind;
      return _never;
    }
  }
}

function maintLabel(
  row: Maintenance,
  parts: readonly PartDefinition[],
  t: (key: string) => string,
): string {
  return dueItemLabel(
    { labelKey: `maintenance.type.${row.type}`, maintenanceId: row.id },
    [row],
    parts,
    t,
  );
}
