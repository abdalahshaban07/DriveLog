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
  template: `
    <app-page-header [title]="i18n.t('health.title')" />
    <p class="privacy" role="status">{{ i18n.t('privacy.onDevice') }}</p>
    <p>
      <a routerLink="/parts/custom">{{ i18n.t('parts.addCustomCta') }}</a>
    </p>
    @if (grouped().attention.length === 0 && grouped().upcoming.length === 0 && grouped().healthy.length === 0 && grouped().tracking.length === 0) {
      <p class="empty-state">{{ i18n.t('health.empty') }}</p>
    }
    @for (sec of sections; track sec.key) {
      @if (grouped()[sec.key].length) {
        <section class="block">
          <h2>{{ i18n.t(sec.title) }}</h2>
          <ul class="list-reveal">
            @for (item of grouped()[sec.key]; track item.partDefinitionId) {
              <li>
                <app-health-row [item]="item" />
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      padding-bottom: calc(5rem + env(safe-area-inset-bottom));
    }
    .privacy {
      color: var(--muted);
      font-size: 0.875rem;
    }
    .block {
      margin-block: 1.25rem;
    }
    h2 {
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    a {
      color: var(--fuel);
    }
  `,
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
}
