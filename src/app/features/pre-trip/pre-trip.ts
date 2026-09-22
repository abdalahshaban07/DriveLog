import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import {
  allPreTripChecked,
  emptyPreTripItems,
  PRE_TRIP_ITEMS,
} from '../../domain/pre-trip';
import { hasExpiredDocs } from '../../domain/vehicle-docs';
import type { PreTripItemId } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';

@Component({
  selector: 'app-pre-trip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton],
  templateUrl: './pre-trip.html',
  styleUrl: './pre-trip.scss',
})
export class PreTripPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly items = signal(emptyPreTripItems());
  readonly note = signal('');
  readonly saving = signal(false);
  readonly savedFlash = signal(false);

  readonly checklist = PRE_TRIP_ITEMS;

  readonly allChecked = computed(() => allPreTripChecked(this.items()));
  readonly docsExpired = computed(() => hasExpiredDocs(this.db.vehicleDocuments()));

  readonly recent = computed(() =>
    [...this.db.preTripChecks()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );

  toggle(id: PreTripItemId): void {
    this.items.update((curr) => ({ ...curr, [id]: !curr[id] }));
  }

  itemLabel(key: MsgKey): string {
    return this.i18n.t(key);
  }

  markReady(): void {
    const next = emptyPreTripItems();
    for (const row of PRE_TRIP_ITEMS) {
      next[row.id] = true;
    }
    this.items.set(next);
  }

  async saveCheck(): Promise<void> {
    if (!this.db.car()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.db.savePreTripCheck({
        date: todayDateOnly(),
        items: this.items(),
        ready: this.allChecked(),
        note: this.note(),
      });
      this.savedFlash.set(true);
      setTimeout(() => this.savedFlash.set(false), 2000);
    } finally {
      this.saving.set(false);
    }
  }
}
