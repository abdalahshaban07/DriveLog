import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fetchFreeCoachText, isAssistantOnline, usableCoachText } from '../../data/assistant';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import { partDefinitionLabel } from '../../domain/part-name';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import {
  healthScore,
  joinHealthNames,
  packHealthInsight,
  sectionForStatus,
  type HealthFactInput,
  type HealthItem,
} from '../../domain/vehicle-health';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';
import { HealthRow } from '../../ui/health-row/health-row';

type HealthSectionKey = 'attention' | 'upcoming' | 'healthy' | 'tracking';

@Component({
  selector: 'app-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PageLine, HealthRow, RouterLink],
  templateUrl: './health.html',
  styleUrl: './health.scss',
})
export class HealthPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly insight = signal('');
  readonly insightBusy = signal(false);
  readonly insightSource = signal<'local' | 'ai'>('local');
  private insightToken = 0;

  readonly online = computed(() => isAssistantOnline(this.db));

  readonly focus = signal<HealthSectionKey | null>(null);

  readonly sections: {
    key: HealthSectionKey;
    title: MsgKey;
    glance: MsgKey;
  }[] = [
    {
      key: 'attention',
      title: 'health.section.attention',
      glance: 'health.glance.attention',
    },
    {
      key: 'upcoming',
      title: 'health.section.upcoming',
      glance: 'health.glance.upcoming',
    },
    {
      key: 'healthy',
      title: 'health.section.healthy',
      glance: 'health.glance.healthy',
    },
    {
      key: 'tracking',
      title: 'health.section.tracking',
      glance: 'health.glance.tracking',
    },
  ];

  readonly grouped = computed(() => {
    const summary = homeHealthSummary(this.db);
    const items = summary.facts?.healthItems ?? [];
    return {
      attention: items.filter((i) => sectionForStatus(i.status) === 'attention'),
      upcoming: items.filter((i) => sectionForStatus(i.status) === 'upcoming'),
      healthy: items.filter((i) => sectionForStatus(i.status) === 'healthy'),
      tracking: items.filter((i) => sectionForStatus(i.status) === 'tracking'),
    };
  });

  readonly attentionCount = computed(() => this.grouped().attention.length);

  readonly score = computed(() => {
    const g = this.grouped();
    return healthScore(
      [...g.attention, ...g.upcoming, ...g.healthy, ...g.tracking].map((item) => item.status),
    );
  });

  readonly tone = computed((): 'ok' | 'warn' | 'stop' => {
    const score = this.score();
    if (score == null || score >= 80) return 'ok';
    if (score >= 50) return 'warn';
    return 'stop';
  });

  readonly nextUp = computed(() => {
    const g = this.grouped();
    if (g.attention[0]) return g.attention[0];
    const pool = [...g.upcoming, ...g.healthy].filter((item) => item.remainingKm != null);
    pool.sort((a, b) => a.remainingKm! - b.remainingKm!);
    return pool[0] ?? g.upcoming[0] ?? null;
  });

  readonly visibleSections = computed(() => {
    const focus = this.focus();
    return focus ? this.sections.filter((sec) => sec.key === focus) : this.sections;
  });

  readonly isEmpty = computed(() => {
    const g = this.grouped();
    return (
      g.attention.length === 0 &&
      g.upcoming.length === 0 &&
      g.healthy.length === 0 &&
      g.tracking.length === 0
    );
  });

  /** Remote coach text when we have it. The card always has localInsight underneath. */
  readonly shownInsight = computed(() => this.insight().trim() || this.localInsight());

  readonly insightPack = computed(() => {
    const g = this.grouped();
    this.i18n.language();
    const attention = [...g.attention].sort((a, b) => severity(a.status) - severity(b.status));
    const soon = g.upcoming.slice(0, 3);
    const later = rankedParts([...g.healthy, ...g.tracking]).slice(0, 3);
    const watch = soon.length ? null : (later[0] ?? null);
    const also = soon.length ? later.slice(0, 2) : later.slice(1);
    return packHealthInsight({
      attention: attention.slice(0, 4).map((item) => this.factInput(item)),
      upcoming: soon.map((item) => this.factInput(item)),
      watch: watch ? this.factInput(watch) : null,
      also: also.map((item) => this.factInput(item)),
      total: g.attention.length + g.upcoming.length + g.healthy.length + g.tracking.length,
      urgentLabel: this.i18n.t('health.insight.factsUrgent'),
      nextLabel: this.i18n.t('health.insight.factsNext'),
      noneLabel: this.i18n.t('health.insight.factsNone'),
    });
  });

  readonly localInsight = computed(() => {
    const pack = this.insightPack();
    const lang = this.i18n.language();
    switch (pack.kind) {
      case 'attention': {
        const head = this.i18n.t('health.insight.attention', {
          details: joinHealthNames(pack.urgent, lang),
        });
        return pack.next
          ? `${head} ${this.i18n.t('health.insight.follow', { detail: pack.next })}`
          : head;
      }
      case 'next':
        return pack.lines
          .map((detail, index) =>
            index === 0
              ? this.i18n.t('health.insight.next', { detail })
              : this.i18n.t('health.insight.part', { detail }),
          )
          .join('\n');
      case 'quiet':
        return this.i18n.t('health.insight.quiet');
      case 'empty':
        return this.i18n.t('health.insight.empty');
      default: {
        const _never: never = pack;
        return _never;
      }
    }
  });

  constructor() {
    void this.loadInsight(false);
  }

  toggleFocus(key: HealthSectionKey): void {
    this.focus.update((cur) => (cur === key ? null : key));
  }

  partLabel(item: HealthItem): string {
    return partDefinitionLabel(item.part, (key) => this.i18n.t(key as MsgKey));
  }

  factInput(item: HealthItem): HealthFactInput {
    return {
      name: this.partLabel(item),
      status: this.i18n.t(healthStatusKey(item.status)),
      remain: this.factRemain(item),
    };
  }

  factRemain(item: HealthItem): string {
    if (item.remainingKm != null) {
      return this.i18n.t('health.insight.remainKm', { n: Math.round(item.remainingKm) });
    }
    if (item.remainingMonths != null) {
      return this.i18n.t('health.insight.remainMonths', { n: item.remainingMonths });
    }
    return this.i18n.t('health.insight.noRemain');
  }

  async loadInsight(force = true): Promise<void> {
    const token = ++this.insightToken;
    if (!this.online()) {
      this.insight.set('');
      this.insightSource.set('local');
      this.insightBusy.set(false);
      return;
    }

    const today = todayDateOnly();
    const settings = this.db.settings();
    const lang = this.i18n.language();
    const cached =
      !force && settings.healthInsightDay === today
        ? usableCoachText(settings.healthInsightText ?? '', lang)
        : null;
    if (cached) {
      this.insight.set(cached);
      this.insightSource.set('ai');
      return;
    }

    const pack = this.insightPack();
    // Keep the local summary on screen while the coach answers. A miss is not stored.
    this.insight.set('');
    this.insightSource.set('local');
    if (pack.kind === 'empty') return;

    this.insightBusy.set(true);
    try {
      const user = `${this.i18n.t('health.insight.prompt')}\n\n${pack.facts}`;
      const raw = await fetchFreeCoachText(lang, this.i18n.t('health.insight.system'), user);
      if (token !== this.insightToken) return;
      const remote = raw ? usableCoachText(raw, lang) : null;
      if (!remote) return;
      this.insight.set(remote);
      this.insightSource.set('ai');
      await this.db.updateSettings({
        healthInsightText: remote,
        healthInsightDay: today,
      });
    } catch {
      // The local summary is already on screen. A miss is not stored.
    } finally {
      if (token === this.insightToken) this.insightBusy.set(false);
    }
  }
}

function healthStatusKey(status: HealthItem['status']): MsgKey {
  switch (status) {
    case 'good':
      return 'health.status.good';
    case 'soon':
      return 'health.status.soon';
    case 'due':
      return 'health.status.due';
    case 'overdue':
      return 'health.status.overdue';
    case 'inspect':
      return 'health.status.inspect';
    case 'unknown':
      return 'health.status.unknown';
    case 'critical':
      return 'health.status.critical';
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

/** Nearest remaining distance first. Parts with no figure stay last and are not given one. */
function rankedParts(items: readonly HealthItem[]): HealthItem[] {
  const byKm = items
    .filter((item) => item.remainingKm != null)
    .sort((a, b) => a.remainingKm! - b.remainingKm!);
  const byMonths = items
    .filter((item) => item.remainingKm == null && item.remainingMonths != null)
    .sort((a, b) => a.remainingMonths! - b.remainingMonths!);
  const rest = items.filter((item) => item.remainingKm == null && item.remainingMonths == null);
  return [...byKm, ...byMonths, ...rest];
}

function severity(status: HealthItem['status']): number {
  switch (status) {
    case 'critical':
      return 0;
    case 'overdue':
      return 1;
    case 'due':
      return 2;
    case 'inspect':
      return 3;
    case 'soon':
      return 4;
    case 'unknown':
      return 5;
    case 'good':
      return 6;
    default: {
      const _never: never = status;
      return _never;
    }
  }
}
