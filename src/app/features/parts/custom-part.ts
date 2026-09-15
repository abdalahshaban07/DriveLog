import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import { partNamesMatch } from '../../domain/part-name';
import { PART_CATEGORIES, type PartCategory, type PartTrackingMode } from '../../domain/models';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { TextField } from '../../ui/text-field';
import { NumericField } from '../../ui/numeric-field';

@Component({
  selector: 'app-custom-part',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton, TextField, NumericField],
  template: `
    <app-page-header [title]="i18n.t('parts.customTitle')" />
    <app-text-field [label]="i18n.t('parts.name')" [(value)]="name" />

    <label for="part-cat">{{ i18n.t('parts.category') }}</label>
    <select id="part-cat" [value]="category()" (change)="onCat($event)">
      @for (c of categories; track c) {
        <option [value]="c">{{ c }}</option>
      }
    </select>

    <label for="part-track">{{ i18n.t('parts.tracking') }}</label>
    <select id="part-track" [value]="tracking()" (change)="onTrack($event)">
      <option value="history">history</option>
      <option value="interval">interval</option>
      <option value="measurement">measurement</option>
      <option value="condition">condition</option>
      <option value="none">none</option>
    </select>

    <app-numeric-field [label]="i18n.t('parts.intervalKm')" [(value)]="intervalKm" />

    @if (dup()) {
      <p role="alert">{{ i18n.t('parts.duplicate') }}</p>
      <app-primary-button [label]="i18n.t('parts.createAnyway')" (pressed)="forceSave()" />
    }

    <app-primary-button [label]="i18n.t('parts.save')" (pressed)="save()" />
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      padding-bottom: calc(5rem + env(safe-area-inset-bottom));
    }
    label {
      display: block;
      margin-top: 0.75rem;
    }
    select {
      width: 100%;
      min-height: var(--tap);
      background: var(--well);
      color: var(--text);
      border-radius: var(--radius);
      border: 1px solid var(--hairline, transparent);
    }
  `,
})
export class CustomPartPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);

  readonly categories = PART_CATEGORIES;
  readonly name = signal('');
  readonly category = signal<PartCategory>('OTHER');
  readonly tracking = signal<PartTrackingMode>('history');
  readonly intervalKm = signal('');
  readonly dup = signal(false);
  private force = false;

  onCat(ev: Event): void {
    this.category.set((ev.target as HTMLSelectElement).value as PartCategory);
  }

  onTrack(ev: Event): void {
    this.tracking.set((ev.target as HTMLSelectElement).value as PartTrackingMode);
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
      userIntervalKm: Number.isFinite(km) && km > 0 ? km : undefined,
      active: true,
    });
    void this.router.navigateByUrl('/health');
  }
}
