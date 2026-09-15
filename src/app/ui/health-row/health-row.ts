import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { HealthItem } from '../../domain/vehicle-health';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';

@Component({
  selector: 'app-health-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a class="health-row" [routerLink]="['/health', item().partDefinitionId]">
      <span class="health-row__status" [attr.data-status]="item().status" aria-hidden="true"></span>
      <span class="health-row__body">
        <span class="health-row__name">{{ label() }}</span>
        <span class="health-row__meta">
          {{ i18n.t(statusKey()) }}
          @if (item().remainingKm != null) {
            · {{ i18n.formatNumber(item().remainingKm!, { maximumFractionDigits: 0 }) }} km
          }
        </span>
      </span>
    </a>
  `,
  styles: `
    .health-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    min-height: var(--tap);
    padding: var(--space-3) var(--space-4);
    text-decoration: none;
    color: var(--text);
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--hairline, transparent);
  }
  .health-row__status {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--muted);
    flex-shrink: 0;
  }
  .health-row__status[data-status='good'] {
    background: var(--ok);
  }
  .health-row__status[data-status='soon'] {
    background: var(--warn);
  }
  .health-row__status[data-status='due'],
  .health-row__status[data-status='overdue'],
  .health-row__status[data-status='critical'] {
    background: var(--stop);
  }
  .health-row__status[data-status='inspect'] {
    background: var(--fuel);
  }
  .health-row__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .health-row__name {
    font-weight: 600;
  }
  .health-row__meta {
    color: var(--muted);
    font-size: 0.875rem;
  }
  `,
})
export class HealthRow {
  readonly i18n = inject(I18n);
  readonly item = input.required<HealthItem>();

  label(): string {
    const p = this.item().part;
    if (p.labelKey) return this.i18n.t(p.labelKey as MsgKey);
    if (p.name?.startsWith('maintenance.') || p.name?.startsWith('parts.')) {
      return this.i18n.t(p.name as MsgKey);
    }
    return p.name ?? p.id;
  }

  statusKey(): MsgKey {
    return `health.status.${this.item().status}` as MsgKey;
  }
}
