import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { Db } from '../../data/db';
import { ROUTINE_CHECK_PART_ID } from '../../domain/part-catalog';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';

@Component({
  selector: 'app-health-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink],
  template: `
    @if (item(); as it) {
      <app-page-header [title]="label()" />
      <p>
        <strong>{{ statusLabel() }}</strong>
        · {{ i18n.t('health.detail.source') }}: {{ it.primarySource }}
      </p>
      @if (it.lastServiceDate) {
        <p>{{ i18n.t('health.detail.lastService') }}: {{ it.lastServiceDate }}</p>
      }
      @if (it.remainingKm != null) {
        <p>{{ i18n.t('health.detail.remaining') }}: {{ i18n.formatNumber(it.remainingKm) }} km</p>
      }
      <ul>
        @for (r of it.reasons; track r) {
          <li>{{ reasonLabel(r) }}</li>
        }
      </ul>
      @if (it.partDefinitionId === routineId) {
        <section>
          <h2>{{ i18n.t('health.detail.checklist') }}</h2>
          <ul>
            <li>{{ i18n.t('health.detail.checklist.oil') }}</li>
            <li>{{ i18n.t('health.detail.checklist.filter') }}</li>
            <li>{{ i18n.t('health.detail.checklist.tires') }}</li>
            <li>{{ i18n.t('health.detail.checklist.brakes') }}</li>
          </ul>
        </section>
      }
      <p>
        <a routerLink="/maintenance" [queryParams]="{ partId: it.partDefinitionId }">
          {{ i18n.t('health.detail.logService') }}
        </a>
      </p>
      @if (it.partDefinitionId !== routineId) {
        <button type="button" class="linkish" (click)="archive()">
          {{ i18n.t('health.detail.archive') }}
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      padding-bottom: calc(5rem + env(safe-area-inset-bottom));
    }
    .linkish {
      background: none;
      border: none;
      color: var(--muted);
      text-decoration: underline;
      min-height: var(--tap);
    }
  `,
})
export class HealthDetailPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly routineId = ROUTINE_CHECK_PART_ID;
  private readonly route = inject(ActivatedRoute);
  readonly partId = toSignal(this.route.paramMap.pipe(map((p) => p.get('partId') ?? '')), {
    initialValue: '',
  });

  readonly item = computed(() => {
    const id = this.partId();
    const items = homeHealthSummary(this.db).facts?.healthItems ?? [];
    return items.find((i) => i.partDefinitionId === id) ?? null;
  });

  label(): string {
    const p = this.item()?.part;
    if (!p) return '';
    if (p.labelKey) return this.i18n.t(p.labelKey as MsgKey);
    if (p.name?.startsWith('maintenance.') || p.name?.startsWith('parts.')) {
      return this.i18n.t(p.name as MsgKey);
    }
    return p.name ?? p.id;
  }

  statusLabel(): string {
    const s = this.item()?.status;
    if (!s) return '';
    return this.i18n.t(`health.status.${s}` as MsgKey);
  }

  reasonLabel(key: string): string {
    try {
      return this.i18n.t(key as MsgKey);
    } catch {
      return key;
    }
  }

  async archive(): Promise<void> {
    const id = this.partId();
    if (id && id !== ROUTINE_CHECK_PART_ID) {
      await this.db.archivePart(id);
    }
  }
}
