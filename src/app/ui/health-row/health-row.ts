import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { partDefinitionLabel } from '../../domain/part-name';
import { lifeRemainingPct, type HealthItem } from '../../domain/vehicle-health';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';

@Component({
  selector: 'app-health-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a
      class="health-row"
      [class.health-row--rich]="rich()"
      [routerLink]="['/health', item().partDefinitionId]"
    >
      @if (!rich()) {
        <span class="health-row__status" [attr.data-status]="item().status" aria-hidden="true"></span>
      }
      <span class="health-row__body">
        <span class="health-row__top">
          <span class="health-row__name">{{ label() }}</span>
          @if (rich()) {
            <span class="health-row__chip" [attr.data-status]="item().status">{{ statusLabel() }}</span>
          }
        </span>
        @if (rich() && lifePct() != null) {
          <span class="health-row__meter" aria-hidden="true">
            <span
              class="health-row__meter-fill"
              [attr.data-status]="item().status"
              [style.width.%]="lifePct()"
            ></span>
          </span>
        }
        @if (!rich()) {
          <span class="health-row__meta">{{ metaLine() }}</span>
          @if (sourceLine(); as src) {
            <span class="health-row__source">{{ src }}</span>
          }
        } @else {
          <span class="health-row__facts">
            @if (kmFact(); as km) {
              <span>{{ km }}</span>
            }
            @if (monthsFact(); as months) {
              <span>{{ months }}</span>
            }
            @if (sourceLabel(); as src) {
              <span>{{ src }}</span>
            }
            @if (lastService(); as when) {
              <span>{{ when }}</span>
            }
          </span>
        }
      </span>
      @if (rich()) {
        <svg class="health-row__go" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      }
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
    .health-row:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .health-row--rich {
      align-items: center;
      padding: var(--space-4);
      background: var(--fill-surface);
      box-shadow: var(--shadow-soft);
      transition: transform var(--motion-fast) var(--ease-out);
    }
    .health-row--rich:active {
      transform: scale(0.985);
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
      flex: 1;
    }
    .health-row--rich .health-row__body {
      gap: var(--space-2);
    }
    .health-row__top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .health-row__name {
      font-weight: 700;
      line-height: 1.3;
    }
    .health-row__chip {
      flex: none;
      padding: 0.12rem 0.45rem;
      border-radius: 99px;
      background: color-mix(in srgb, var(--muted) 16%, var(--surface));
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .health-row__chip[data-status='good'] {
      background: color-mix(in srgb, var(--ok) 16%, var(--surface));
      color: var(--ok);
    }
    .health-row__chip[data-status='soon'] {
      background: color-mix(in srgb, var(--warn) 18%, var(--surface));
      color: var(--warn);
    }
    .health-row__chip[data-status='due'],
    .health-row__chip[data-status='overdue'],
    .health-row__chip[data-status='critical'] {
      background: color-mix(in srgb, var(--stop) 16%, var(--surface));
      color: var(--stop);
    }
    .health-row__chip[data-status='inspect'] {
      background: color-mix(in srgb, var(--fuel) 20%, var(--surface));
      color: var(--text);
    }
    .health-row__meter {
      display: block;
      height: 4px;
      border-radius: 99px;
      background: var(--well);
      overflow: hidden;
    }
    .health-row__meter-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--ok);
    }
    .health-row__meter-fill[data-status='soon'] {
      background: var(--warn);
    }
    .health-row__meter-fill[data-status='due'],
    .health-row__meter-fill[data-status='overdue'],
    .health-row__meter-fill[data-status='critical'] {
      background: var(--stop);
    }
    .health-row__meter-fill[data-status='inspect'] {
      background: var(--fuel);
    }
    .health-row__meta,
    .health-row__source,
    .health-row__facts {
      color: var(--muted);
      font-size: 0.875rem;
    }
    .health-row__facts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem 0.75rem;
      font-size: 0.8rem;
      line-height: 1.35;
    }
    .health-row__go {
      flex: none;
      width: 1.1rem;
      height: 1.1rem;
      fill: none;
      stroke: var(--muted);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    :host-context([dir='rtl']) .health-row__go {
      transform: scaleX(-1);
    }
    @media (prefers-reduced-motion: reduce) {
      .health-row--rich:active {
        transform: none;
      }
    }
  `,
})
export class HealthRow {
  readonly i18n = inject(I18n);
  readonly item = input.required<HealthItem>();
  readonly rich = input(false);

  readonly label = computed(() =>
    partDefinitionLabel(this.item().part, (key) => this.i18n.t(key as MsgKey)),
  );

  readonly statusLabel = computed(() =>
    this.i18n.t(`health.status.${this.item().status}` as MsgKey),
  );

  readonly lifePct = computed(() => lifeRemainingPct(this.item()));

  readonly metaLine = computed(() => {
    const it = this.item();
    const parts = [this.statusLabel()];
    if (it.remainingKm != null) {
      parts.push(this.kmFact()!);
    }
    if (it.remainingMonths != null) {
      parts.push(this.monthsFact()!);
    }
    return parts.join(' · ');
  });

  readonly kmFact = computed(() => {
    const km = this.item().remainingKm;
    if (km == null) return null;
    return `${this.i18n.formatNumber(km, { maximumFractionDigits: 0 })} ${this.i18n.t('common.km')}`;
  });

  readonly monthsFact = computed(() => {
    const months = this.item().remainingMonths;
    if (months == null) return null;
    return this.i18n.t('health.row.monthsLeft', { n: months });
  });

  readonly sourceLine = computed(() => {
    const src = this.sourceLabel();
    if (!src) return null;
    return `${this.i18n.t('health.detail.source')} · ${src}`;
  });

  readonly sourceLabel = computed(() => {
    const src = this.item().primarySource;
    if (src === 'UNKNOWN') return null;
    return this.i18n.t(`health.source.${src}` as MsgKey);
  });

  readonly lastService = computed(() => {
    const date = this.item().lastServiceDate;
    if (!date) return null;
    return `${this.i18n.t('health.detail.lastService')} ${this.i18n.formatDate(date, { day: 'numeric', month: 'short' })}`;
  });
}
