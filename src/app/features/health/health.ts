import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
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
}
