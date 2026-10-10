import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import {
  allPreTripChecked,
  countPreTripChecked,
  emptyPreTripItems,
  PRE_TRIP_ITEMS,
} from '../../domain/pre-trip';
import { PRE_TRIP_ITEM_IDS, type PreTripItemId } from '../../domain/models';
import { hasExpiredDocs } from '../../domain/vehicle-docs';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-pre-trip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PageLine, PrimaryButton, TextField],
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
  readonly total = PRE_TRIP_ITEM_IDS.length;

  readonly doneCount = computed(() => countPreTripChecked(this.items()));
  readonly leftCount = computed(() => this.total - this.doneCount());
  readonly progressPct = computed(() => Math.round((this.doneCount() / this.total) * 100));
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

  doneOf(items: Record<PreTripItemId, boolean>): number {
    return countPreTripChecked(items);
  }

  clearChecks(): void {
    this.items.set(emptyPreTripItems());
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
      this.items.set(emptyPreTripItems());
      this.note.set('');
      this.savedFlash.set(true);
      setTimeout(() => this.savedFlash.set(false), 2000);
    } finally {
      this.saving.set(false);
    }
  }
}
