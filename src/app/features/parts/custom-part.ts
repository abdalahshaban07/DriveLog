import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { partNamesMatch } from '../../domain/part-name';
import {
  PART_CATEGORIES,
  type PartCategory,
  type PartTrackingMode,
} from '../../domain/models';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { NumericField } from '../../ui/numeric-field';
import { SelectField, type SelectOption } from '../../ui/select-field';

const TRACKING_MODES: readonly PartTrackingMode[] = [
  'history',
  'interval',
  'measurement',
  'condition',
  'none',
];

@Component({
  selector: 'app-custom-part',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton, TextField, NumericField, SelectField],
  templateUrl: './custom-part.html',
  styleUrl: './custom-part.scss',
})
export class CustomPartPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly name = signal('');
  readonly category = signal<PartCategory>('OTHER');
  readonly tracking = signal<PartTrackingMode>('history');
  readonly intervalKm = signal('');
  readonly dup = signal(false);
  private force = false;

  readonly categoryOptions = computed<SelectOption[]>(() =>
    PART_CATEGORIES.map((c) => ({
      value: c,
      label: this.i18n.t(`parts.cat.${c}` as MsgKey),
    })),
  );

  readonly trackingOptions = computed<SelectOption[]>(() =>
    TRACKING_MODES.map((m) => ({
      value: m,
      label: this.i18n.t(`parts.track.${m}` as MsgKey),
    })),
  );

  onCat(value: string): void {
    this.category.set(value as PartCategory);
  }

  onTrack(value: string): void {
    this.tracking.set(value as PartTrackingMode);
  }

  forceSave(): void {
    this.force = true;
    void this.save();
  }

  async save(): Promise<void> {
    const car = this.db.car();
    if (!car) return;
    const n = this.name().trim();
    if (!n) return;
    const existing = this.db.catalog().find((p) => {
      if (p.name && partNamesMatch(p.name, n)) return true;
      if (p.labelKey) {
        try {
          return partNamesMatch(this.i18n.t(p.labelKey as MsgKey), n);
        } catch {
          return false;
        }
      }
      return false;
    });
    if (existing && !this.force) {
      this.dup.set(true);
      return;
    }
    const km = Number(this.intervalKm());
    await this.db.savePart({
      carId: car.id,
      name: n,
      category: this.category(),
      source: 'custom',
      trackingMode: this.tracking(),
      userIntervalKm:
        this.tracking() === 'interval' && Number.isFinite(km) && km > 0
          ? km
          : undefined,
      active: true,
    });
    void this.router.navigateByUrl('/health');
  }
}
