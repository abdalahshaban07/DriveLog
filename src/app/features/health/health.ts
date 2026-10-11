import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline, usableCoachText } from '../../data/assistant';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import { partDefinitionLabel } from '../../domain/part-name';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import {
  healthScore,
  localHealthGlance,
  sectionForStatus,
  type HealthItem,
} from '../../domain/vehicle-health';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { HealthRow } from '../../ui/health-row/health-row';

type HealthSectionKey = 'attention' | 'upcoming' | 'healthy' | 'tracking';

@Component({
  selector: 'app-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, HealthRow, RouterLink],
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

  readonly localInsight = computed(() => {
    const g = this.grouped();
    const lang = this.i18n.language();
    const attention = [...g.attention]
      .sort((a, b) => severity(a.status) - severity(b.status))
      .map((item) => this.partLabel(item));
    const next = this.nextUp();
    const glance = localHealthGlance(
      {
        attention,
        next: next && sectionForStatus(next.status) !== 'attention' ? this.partLabel(next) : null,
        total: g.attention.length + g.upcoming.length + g.healthy.length + g.tracking.length,
      },
      lang,
    );
    switch (glance.kind) {
      case 'attention':
        return this.i18n.t('health.insight.attention', { names: glance.names });
      case 'next':
        return this.i18n.t('health.insight.next', { name: glance.name });
      case 'quiet':
        return this.i18n.t('health.insight.quiet');
      case 'empty':
        return this.i18n.t('health.insight.empty');
      default: {
        const _never: never = glance;
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

  async loadInsight(force = true): Promise<void> {
    if (!this.online()) {
      this.insight.set('');
      this.insightSource.set('local');
      return;
    }

    const today = todayDateOnly();
    const settings = this.db.settings();
    const lang = this.i18n.language();
    const triedToday = !force && settings.healthInsightDay === today;
    const cached = triedToday ? usableCoachText(settings.healthInsightText ?? '', lang) : null;
    if (cached) {
      this.insight.set(cached);
      this.insightSource.set('ai');
      return;
    }
    // ponytail: a failed day is cached so opening Health doesn't burn the free coach slot again. Refresh forces another try.
    if (triedToday) return;

    this.insightBusy.set(true);
    try {
      const question = this.i18n.t('health.insight.prompt');
      const reply = await fetchChatReply(this.db, question, lang, (key, params) =>
        this.i18n.t(key as MsgKey, params),
      );
      const remote = reply.source === 'remote' ? usableCoachText(reply.text, lang) : null;
      if (remote) {
        this.insight.set(remote);
        this.insightSource.set('ai');
        await this.db.updateSettings({
          healthInsightText: remote,
          healthInsightDay: today,
        });
      } else {
        this.insight.set('');
        this.insightSource.set('local');
        await this.db.updateSettings({
          healthInsightText: undefined,
          healthInsightDay: today,
        });
      }
    } finally {
      this.insightBusy.set(false);
    }
  }
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
