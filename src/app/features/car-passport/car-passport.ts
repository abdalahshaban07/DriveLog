import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  buildPassportView,
  carPassportToPdf,
  downloadFile,
  sharePassportPdf,
} from '../../domain/car-passport';
import type { Maintenance, VehicleDocument } from '../../domain/models';
import { maintenanceRecordLabel } from '../../domain/part-name';
import { nextExpiringDoc, type DocUrgency } from '../../domain/vehicle-docs';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';

/** Short currency label for passport PDF (avoids Intl BiDi mess). */
function pdfCurrencyLabel(code: string, lang: string): string {
  if (lang === 'ar' && code === 'EGP') {
    return 'ج.م';
  }
  return code;
}

@Component({
  selector: 'app-car-passport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton, RouterLink],
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
    return buildPassportView({
      car,
      fillUps: this.db.fillUps(),
      documents: this.db.vehicleDocuments(),
      maintenance: this.db.maintenance(),
    });
  });

  urgencyLabel(urgency: DocUrgency): string {
    switch (urgency) {
      case 'expired':
        return this.i18n.t('vault.urgency.expired');
      case 'd1':
        return this.i18n.t('vault.urgency.d1');
      case 'd7':
        return this.i18n.t('vault.urgency.d7');
      case 'd30':
        return this.i18n.t('vault.urgency.d30');
      case 'ok':
        return this.i18n.t('vault.urgency.ok');
      default: {
        const _never: never = urgency;
        return _never;
      }
    }
  }

  docKind(doc: VehicleDocument): string {
    if (doc.kind === 'other' && doc.label?.trim()) {
      return doc.label.trim();
    }
    return this.i18n.t(`vault.kind.${doc.kind}` as MsgKey);
  }

  serviceLabel(row: Maintenance): string {
    return maintenanceRecordLabel(row, this.db.catalog(), (key) => this.i18n.t(key as MsgKey));
  }

  monthDelta(pct: number): string {
    if (Math.abs(pct) < 3) {
      return this.i18n.t('home.monthFuelDelta.same');
    }
    const abs = this.i18n.formatNumber(Math.abs(pct), { maximumFractionDigits: 0 });
    return pct > 0
      ? this.i18n.t('home.monthFuelDelta.up', { pct: abs })
      : this.i18n.t('home.monthFuelDelta.down', { pct: `-${abs}` });
  }

  deltaTone(pct: number): 'up' | 'down' | 'flat' {
    if (Math.abs(pct) < 3) {
      return 'flat';
    }
    return pct > 0 ? 'up' : 'down';
  }

  async exportPdf(share: boolean): Promise<void> {
    const car = this.car();
    if (!car) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const next = nextExpiringDoc(this.db.vehicleDocuments());
      const currency = this.db.settings().currency;
      const blob = await carPassportToPdf(
        {
          car,
          fillUps: this.db.fillUps(),
          documents: this.db.vehicleDocuments(),
          maintenance: this.db.maintenance(),
        },
        {
          title: this.i18n.t('passport.title'),
          generatedPrefix: this.i18n.t('passport.generatedPrefix'),
          vehicle: this.i18n.t('passport.vehicle'),
          odometer: this.i18n.t('passport.odometer'),
          economy: this.i18n.t('passport.economy'),
          monthSpend: this.i18n.t('passport.monthSpend'),
          nextDoc: this.i18n.t('passport.nextDoc'),
          none: this.i18n.t('passport.none'),
          km: this.i18n.t('common.km'),
          lPer100: this.i18n.t('common.lPer100'),
          currencyLabel: pdfCurrencyLabel(currency, this.i18n.language()),
          maintenance: this.i18n.t('passport.maintenance'),
          maintEmpty: this.i18n.t('passport.maintEmpty'),
          plate: this.i18n.t('settings.plate'),
          year: this.i18n.t('date.year'),
          tank: this.i18n.t('settings.tankCapacity'),
          liters: this.i18n.t('common.liters'),
          driven: this.i18n.t('passport.driven'),
          fills: this.i18n.t('passport.fills'),
          lastFill: this.i18n.t('home.lastFill'),
          costPerKm: this.i18n.t('home.costPerKm'),
          daysLeft: this.i18n.t('home.license.days'),
          nextDocKind: next ? this.i18n.t(`vault.kind.${next.kind}` as MsgKey) : undefined,
          typeLabel: (type, otherLabel) =>
            maintenanceRecordLabel({ type, otherLabel }, this.db.catalog(), (key) =>
              this.i18n.t(key as MsgKey),
            ),
        },
        { rtl: this.i18n.dir() === 'rtl' },
      );
      const file = new File([blob], `drivelog-passport-${car.nickname.replace(/\s+/g, '-')}.pdf`, {
        type: 'application/pdf',
      });
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
