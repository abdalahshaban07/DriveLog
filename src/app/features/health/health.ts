import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline } from '../../data/assistant';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import { sectionForStatus } from '../../domain/vehicle-health';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { HealthRow } from '../../ui/health-row/health-row';

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

  readonly sections: {
    key: 'attention' | 'upcoming' | 'healthy' | 'tracking';
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

  async loadInsight(force = true): Promise<void> {
    this.insightBusy.set(true);
    const today = todayDateOnly();
    const settings = this.db.settings();

    try {
      if (
        !force &&
        this.online() &&
        settings.healthInsightText &&
        settings.healthInsightDay === today
      ) {
        this.insight.set(settings.healthInsightText);
        this.insightSource.set('ai');
        return;
      }

      if (!this.online()) {
        this.insight.set('');
        this.insightSource.set('local');
        return;
      }

      const g = this.grouped();
      const top = [...g.attention, ...g.upcoming].slice(0, 3).map((item) => ({
        name: item.part.name ?? item.part.labelKey ?? item.partDefinitionId,
        status: item.status,
      }));
      const facts = {
        attention: g.attention.length,
        upcoming: g.upcoming.length,
        healthy: g.healthy.length,
        tracking: g.tracking.length,
        top,
      };
      const question = `${this.i18n.t('health.insight.prompt')}\nJSON:${JSON.stringify(facts)}`;
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
