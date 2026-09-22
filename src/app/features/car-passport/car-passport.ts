import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import {
  carPassportToPdf,
  downloadFile,
  sharePassportPdf,
} from '../../domain/car-passport';
import { latestEconomy, monthFuelSpend } from '../../domain/economy';
import { nextExpiringDoc } from '../../domain/vehicle-docs';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';

@Component({
  selector: 'app-car-passport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton],
  templateUrl: './car-passport.html',
  styleUrl: './car-passport.scss',
})
export class CarPassportPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');

  readonly car = computed(() => this.db.car());
  readonly preview = computed(() => {
    const car = this.car();
    if (!car) {
      return null;
    }
    const eco = latestEconomy(this.db.fillUps());
    const month = monthFuelSpend(this.db.fillUps());
    const nextDoc = nextExpiringDoc(this.db.vehicleDocuments());
    return {
      name: [car.nickname, car.make, car.model, car.year].filter(Boolean).join(' · '),
      odo: car.currentOdometer,
      economy: eco?.litersPer100Km ?? null,
      monthSpend: month,
      nextDoc,
    };
  });

  async exportPdf(share: boolean): Promise<void> {
    const car = this.car();
    if (!car) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const blob = await carPassportToPdf(
        {
          car,
          fillUps: this.db.fillUps(),
          documents: this.db.vehicleDocuments(),
          formatMoney: (n) => this.i18n.formatMoney(n, this.db.settings().currency, 2),
          formatUnit: (n) => this.i18n.formatUnit(n, 'common.lPer100', 1),
          formatDate: (d) => this.i18n.formatDate(d),
          formatNumber: (n) => this.i18n.formatNumber(n, { maximumFractionDigits: 0 }),
        },
        {
          title: this.i18n.t('passport.title'),
          generated: this.i18n.t('passport.generated', {
            date: new Date().toISOString().slice(0, 10),
          }),
          vehicle: this.i18n.t('passport.vehicle'),
          odometer: this.i18n.t('passport.odometer'),
          economy: this.i18n.t('passport.economy'),
          monthSpend: this.i18n.t('passport.monthSpend'),
          nextDoc: this.i18n.t('passport.nextDoc'),
          none: this.i18n.t('passport.none'),
        },
        { rtl: this.i18n.dir() === 'rtl' },
      );
      const file = new File(
        [blob],
        `drivelog-passport-${car.nickname.replace(/\s+/g, '-')}.pdf`,
        { type: 'application/pdf' },
      );
      if (share) {
        const shared = await sharePassportPdf(file, this.i18n.t('passport.shareTitle'));
        this.status.set(
          shared ? this.i18n.t('passport.shared') : this.i18n.t('passport.downloaded'),
        );
      } else {
        downloadFile(file);
        this.status.set(this.i18n.t('passport.downloaded'));
      }
    } catch {
      this.error.set(this.i18n.t('passport.failed'));
    } finally {
      this.busy.set(false);
    }
  }
}
