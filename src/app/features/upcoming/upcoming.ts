import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  buildUpcoming,
  upcomingMeta,
  upcomingStatusLabel,
  upcomingTitle,
  type UpcomingItem,
} from '../../domain/upcoming';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { DueRow } from '../../ui/due-row';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';

@Component({
  selector: 'app-upcoming',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PageLine, RouterLink, DueRow],
  templateUrl: './upcoming.html',
  styleUrl: './upcoming.scss',
})
export class UpcomingPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);

  readonly items = computed(() => {
    const car = this.db.car();
    if (!car) {
      return [];
    }
    return buildUpcoming({
      maintenance: this.db.maintenance(),
      documents: this.db.vehicleDocuments(),
      odometer: car.currentOdometer,
      licenseExpiry: car.licenseExpiry,
      registrationExpiry: car.registrationExpiry,
    });
  });

  back(): void {
    void this.router.navigateByUrl('/');
  }

  title(item: UpcomingItem): string {
    return upcomingTitle(item, this.db.maintenance(), this.db.catalog(), this.translate);
  }

  meta(item: UpcomingItem): string {
    return upcomingMeta(item, (day) => this.i18n.formatDate(day));
  }

  statusLabel(item: UpcomingItem): string {
    return upcomingStatusLabel(item, this.db.car()?.currentOdometer ?? 0, this.translate);
  }

  private readonly translate = (key: string, params?: Record<string, number>): string =>
    this.i18n.t(key as MsgKey, params);
}
