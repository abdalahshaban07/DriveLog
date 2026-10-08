import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { daysUntilExpiry } from '../../domain/vehicle-docs';
import { maintenanceRecordLabel } from '../../domain/part-name';
import { buildUpcoming, type UpcomingItem } from '../../domain/upcoming';
import type { VehicleDocKind } from '../../domain/models';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { DueRow } from '../../ui/due-row';
import { PageHeader } from '../../ui/page-header';

@Component({
  selector: 'app-upcoming',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, DueRow],
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
    if (item.maintenanceId) {
      const row = this.db.maintenance().find((entry) => entry.id === item.maintenanceId);
      if (row) {
        return maintenanceRecordLabel(row, this.db.catalog(), (key) => this.i18n.t(key as MsgKey));
      }
    }
    if (item.docKind) {
      return this.docTitle(item.docKind, item.docLabel);
    }
    return '';
  }

  meta(item: UpcomingItem): string {
    return item.dueDate ? this.i18n.formatDate(item.dueDate) : '';
  }

  statusLabel(item: UpcomingItem): string {
    if (item.dueDate) {
      const days = daysUntilExpiry(item.dueDate);
      if (days === 0) {
        return this.i18n.t('vault.dueToday');
      }
      const n = Math.abs(days);
      return days < 0
        ? this.i18n.t('vault.daysOver', { days: n })
        : this.i18n.t('vault.daysLeft', { days: n });
    }
    if (item.dueKm != null) {
      const left = item.dueKm - (this.db.car()?.currentOdometer ?? 0);
      const n = Math.abs(left);
      return left < 0 ? this.i18n.t('home.kmOver', { km: n }) : this.i18n.t('home.kmLeft', { km: n });
    }
    return '';
  }

  private docTitle(kind: VehicleDocKind, label?: string): string {
    switch (kind) {
      case 'license':
        return this.i18n.t('vault.kind.license');
      case 'registration':
        return this.i18n.t('vault.kind.registration');
      case 'insurance':
        return this.i18n.t('vault.kind.insurance');
      case 'inspection':
        return this.i18n.t('vault.kind.inspection');
      case 'other':
        return label?.trim() || this.i18n.t('vault.kind.other');
      default: {
        const _never: never = kind;
        return _never;
      }
    }
  }
}
