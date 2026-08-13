import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  latestEconomy,
  monthFuelSpend,
  overallLitersPer100Km,
} from '../../domain/economy';
import { buildDueItems, nextDueItem } from '../../domain/dues';
import type { DueItem } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { InstallPwa } from '../../pwa/install-pwa';
import { DueRow } from '../../ui/due-row';
import { PageHeader } from '../../ui/page-header';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeader, DueRow, DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly install = inject(InstallPwa);

  readonly carName = computed(
    () => this.db.car()?.nickname || this.i18n.t('app.name'),
  );
  readonly economy = computed(() => latestEconomy(this.db.fillUps()));
  readonly overallL100 = computed(() => overallLitersPer100Km(this.db.fillUps()));
  readonly monthSpend = computed(() => monthFuelSpend(this.db.fillUps()));
  readonly due = computed(() => {
    const car = this.db.car();
    if (!car) {
      return null;
    }
    return nextDueItem(
      buildDueItems(this.db.settings(), this.db.maintenance(), car.currentOdometer),
    );
  });
  readonly showInstall = computed(
    () =>
      !this.install.installed() && !this.db.settings().installBannerDismissed,
  );

  formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${this.db.settings().currency}`;
    }
  }

  dueTitle(d: DueItem): string {
    const name = d.labelParams?.['name'];
    if (typeof name === 'string' && name) {
      return name;
    }
    return this.i18n.t(d.labelKey as MsgKey);
  }

  dueMeta(d: { dueDate?: string; dueKm?: number }): string {
    const parts: string[] = [];
    if (d.dueDate) {
      parts.push(d.dueDate);
    }
    if (d.dueKm != null) {
      parts.push(`${d.dueKm} km`);
    }
    return parts.join(' · ');
  }

  async doInstall(): Promise<void> {
    await this.install.promptInstall();
  }

  async dismissInstall(): Promise<void> {
    await this.db.updateSettings({ installBannerDismissed: true });
  }
}
