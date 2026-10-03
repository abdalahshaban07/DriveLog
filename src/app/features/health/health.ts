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
    this.insightBusy.set(true);
    const today = todayDateOnly();
    const settings = this.db.settings();

    try {
      const cached =
        !force &&
        this.online() &&
        settings.healthInsightText &&
        settings.healthInsightDay === today
          ? usableCoachText(settings.healthInsightText, this.i18n.language())
          : null;
      if (cached) {
        this.insight.set(cached);
        this.insightSource.set('ai');
        return;
      }

      if (!this.online()) {
        this.insight.set('');
        this.insightSource.set('local');
        return;
      }

      const question = this.i18n.t('health.insight.prompt');
      const reply = await fetchChatReply(
        this.db,
        question,
        this.i18n.language(),
        (key, params) => this.i18n.t(key as MsgKey, params),
      );
      if (reply.source === 'remote' && reply.text.trim()) {
        const text = reply.text.trim();
        this.insight.set(text);
        this.insightSource.set('ai');
        await this.db.updateSettings({
          healthInsightText: text,
          healthInsightDay: today,
        });
      } else {
        this.insight.set('');
        this.insightSource.set('local');
      }
    } finally {
      this.insightBusy.set(false);
    }
  }
}
