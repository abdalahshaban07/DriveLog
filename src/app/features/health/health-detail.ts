import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { Db } from '../../data/db';
import { ROUTINE_CHECK_PART_ID } from '../../domain/part-catalog';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';

@Component({
  selector: 'app-health-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink],
  templateUrl: './health-detail.html',
  styleUrl: './health-detail.scss',
})
export class HealthDetailPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);
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
      void this.router.navigateByUrl('/health');
    }
  }
}
