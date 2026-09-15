import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import { sectionForStatus } from '../../domain/vehicle-health';
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

  readonly sections = [
    { key: 'attention' as const, title: 'health.section.attention' as const },
    { key: 'upcoming' as const, title: 'health.section.upcoming' as const },
    { key: 'healthy' as const, title: 'health.section.healthy' as const },
    { key: 'tracking' as const, title: 'health.section.tracking' as const },
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
