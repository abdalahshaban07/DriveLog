import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import {
  estimateExpectedCost,
  historicalMonthlyMaintenanceAverage,
  remainingMonthlyMaintenanceBudget,
  reserveTiers,
  type BudgetHealth,
} from '../../domain/budget-engine';
import { buildForecasts, estimateMonthlyKm, upcomingCostWindows } from '../../domain/maintenance-forecast';
import { homeHealthSummary, todayDateOnly } from '../../domain/vehicle-facts';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { NumericField } from '../../ui/numeric-field';

@Component({
  selector: 'app-budget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton, NumericField],
  templateUrl: './budget.html',
  styleUrl: './budget.scss',
})
export class BudgetPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly car = this.db.car;
  readonly budgetMonthly = signal('');
  readonly reserveTarget = signal('');
  readonly reserveBalance = signal('');

  constructor() {
    const c = this.db.car();
    if (c) {
      this.budgetMonthly.set(c.maintenanceBudgetMonthly != null ? String(c.maintenanceBudgetMonthly) : '');
      this.reserveTarget.set(c.reserveTargetMonthly != null ? String(c.reserveTargetMonthly) : '');
      this.reserveBalance.set(
        c.maintenanceReserveBalance != null ? String(c.maintenanceReserveBalance) : '',
      );
    }
  }

  readonly summary = computed(() => {
    const c = this.db.car();
    const empty = {
      budgetHealth: 'UNKNOWN' as BudgetHealth,
      remaining: null as number | null,
      eligible90: 0,
      tiers: {
        minimum: null as number | null,
        recommended: null as number | null,
        comfortable: null as number | null,
      },
      forecasts: [] as { months: number; known: number; estimated: number }[],
    };
    if (!c) return empty;
    const facts = homeHealthSummary(this.db).facts;
    if (!facts) return empty;
    const today = todayDateOnly();
    const currency = this.db.snapshotCurrency();
    const remaining = remainingMonthlyMaintenanceBudget(
      c,
      this.db.maintenance(),
      currency,
      today,
    );
    const monthlyKm = estimateMonthlyKm({
      car: c,
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      today,
    });
    const estimate = (item: (typeof facts.healthItems)[number]) =>
      estimateExpectedCost(item.part, this.db.maintenance(), c.id, currency);
    const windows = upcomingCostWindows({
      items: facts.healthItems,
      today,
      monthlyKm,
      estimateCost: estimate,
    });
    const w90 = windows.find((w) => w.days === 90);
    const w180 = windows.find((w) => w.days === 180);
    const eligible90 = (w90?.known ?? 0) + (w90?.estimated ?? 0);
    const eligible180 = (w180?.known ?? 0) + (w180?.estimated ?? 0);
    const hist = historicalMonthlyMaintenanceAverage(c, this.db.maintenance(), currency, today);
    const tiers = reserveTiers({
      historicalMonthly: hist,
      eligible90,
      eligible180,
    });
    const forecasts = buildForecasts({
      items: facts.healthItems,
      today,
      monthlyKm,
      estimateCost: estimate,
    });
    return {
      budgetHealth: facts.budgetHealth,
      remaining,
      eligible90,
      tiers,
      forecasts,
    };
  });

  healthLabel(): string {
    const h = this.summary().budgetHealth;
    return this.i18n.t(`budget.health.${h}` as MsgKey);
  }

  async save(): Promise<void> {
    const num = (s: string) => {
      const n = Number(s);
      return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
    };
    await this.db.updateCar({
      maintenanceBudgetMonthly: num(this.budgetMonthly()),
      reserveTargetMonthly: num(this.reserveTarget()),
      maintenanceReserveBalance: num(this.reserveBalance()),
    });
  }

  money(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 0);
  }
}
