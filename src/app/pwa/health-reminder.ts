import { Injectable, inject } from '@angular/core';
import { Db } from '../data/db';
import {
  criticalDueCostSum,
  evaluateBudgetHealth,
  estimateExpectedCost,
  remainingMonthlyMaintenanceBudget,
  reserveTiers,
  historicalMonthlyMaintenanceAverage,
} from '../domain/budget-engine';
import { estimateMonthlyKm, upcomingCostWindows } from '../domain/maintenance-forecast';
import { homeHealthSummary, todayDateOnly } from '../domain/vehicle-facts';
import type { HealthItem } from '../domain/vehicle-health';
import type { BudgetHealth } from '../domain/budget-engine';
import type { HealthStatus } from '../domain/models';
import type { MsgKey } from '../i18n/en';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';

const ATTENTION: ReadonlySet<HealthStatus> = new Set([
  'critical',
  'overdue',
  'due',
  'inspect',
]);

/** Health/budget/forecast transition notifies (30/32). First baseline is silent. */
@Injectable({ providedIn: 'root' })
export class HealthReminder {
  private readonly db = inject(Db);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(I18n);

  async check(): Promise<void> {
    const settings = this.db.settings();
    if (settings.remindersEnabled !== true) return;
    if (this.notify.permission() !== 'granted') return;

    const car = this.db.car();
    if (!car) return;

    const facts = homeHealthSummary(this.db).facts;
    if (!facts) return;

    const today = todayDateOnly();
    const currency = this.db.snapshotCurrency();

    if (settings.notifyMaintenance !== false) {
      await this.checkMaintenanceTransitions(car.id, facts.healthItems);
    }

    if (settings.notifyBudget === false && settings.notifyForecast === false) {
      return;
    }

    const remaining = remainingMonthlyMaintenanceBudget(
      car,
      this.db.maintenance(),
      currency,
      today,
    );
    const monthlyKm = estimateMonthlyKm({
      car,
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      today,
    });
    const estimate = (item: HealthItem) =>
      estimateExpectedCost(item.part, this.db.maintenance(), car.id, currency);
    const windows = upcomingCostWindows({
      items: facts.healthItems,
      today,
      monthlyKm,
      estimateCost: estimate,
    });
    const w90 = windows.find((w) => w.days === 90);
    const w30 = windows.find((w) => w.days === 30);
    const w180 = windows.find((w) => w.days === 180);
    const eligible90 = (w90?.known ?? 0) + (w90?.estimated ?? 0);
    const eligible180 = (w180?.known ?? 0) + (w180?.estimated ?? 0);
    const hist = historicalMonthlyMaintenanceAverage(
      car,
      this.db.maintenance(),
      currency,
      today,
    );
    const tiers = reserveTiers({
      historicalMonthly: hist,
      eligible90,
      eligible180,
    });
    const prefix = today.slice(0, 7);
    const currentMonthSpend = this.db
      .maintenance()
      .filter((m) => m.date.startsWith(prefix) && m.cost != null)
      .reduce((s, m) => s + (m.cost ?? 0), 0);
    const criticalDue = criticalDueCostSum(facts.healthItems, estimate);
    const budgetHealth = evaluateBudgetHealth({
      car,
      remainingMonthly: remaining,
      currentMonthSpend,
      eligible90,
      reserveRecommended: tiers.recommended,
      reserveComfortable: tiers.comfortable,
      criticalDueCost: criticalDue,
    });

    if (settings.notifyBudget !== false) {
      await this.checkBudgetTransition(car.id, budgetHealth);
    }
    if (settings.notifyForecast !== false) {
      const budget = car.maintenanceBudgetMonthly;
      const crossed = budget != null && budget > 0 && eligible90 > 2 * budget;
      const known30 = w30?.known ?? 0;
      await this.checkForecastTransition(car.id, crossed, known30 > 0);
    }
  }

  private async checkMaintenanceTransitions(
    carId: string,
    items: readonly HealthItem[],
  ): Promise<void> {
    for (const item of items) {
      const prev = this.db
        .healthNotificationState()
        .find((n) => n.carId === carId && n.partDefinitionId === item.partDefinitionId);
      const status = item.status;
      if (!prev) {
        await this.db.saveHealthNotificationState({
          carId,
          partDefinitionId: item.partDefinitionId,
          lastStatus: status,
          baselinedAt: new Date().toISOString(),
        });
        continue;
      }
      if (prev.lastStatus === status) continue;
      const shouldNotify = ATTENTION.has(status);
      await this.db.saveHealthNotificationState({
        carId,
        partDefinitionId: item.partDefinitionId,
        lastStatus: status,
        lastNotifiedStatus: shouldNotify ? status : prev.lastNotifiedStatus,
      });
      if (shouldNotify && prev.lastNotifiedStatus !== status) {
        this.notify.showGeneric(
          this.i18n.t('notify.health.title' as MsgKey),
          this.i18n.t('notify.health.body' as MsgKey, {
            status: this.i18n.t(`health.status.${status}` as MsgKey),
          }),
          `health-${item.partDefinitionId}`,
        );
      }
    }
  }

  private async checkBudgetTransition(carId: string, health: BudgetHealth): Promise<void> {
    const id = `${carId}:budget`;
    const prev = this.db.healthNotificationState().find((n) => n.id === id);
    if (!prev) {
      await this.db.saveHealthNotificationState({
        id,
        carId,
        partDefinitionId: '__budget__',
        lastBudgetHealth: health,
        baselinedAt: new Date().toISOString(),
      });
      return;
    }
    const enteringWarn =
      (health === 'HIGH' || health === 'CRITICAL') && prev.lastBudgetHealth !== health;
    await this.db.saveHealthNotificationState({
      id,
      carId,
      partDefinitionId: '__budget__',
      lastBudgetHealth: health,
    });
    if (enteringWarn) {
      this.notify.showGeneric(
        this.i18n.t('notify.budget.title' as MsgKey),
        this.i18n.t('notify.budget.body' as MsgKey),
        'budget-health',
      );
    }
  }

  private async checkForecastTransition(
    carId: string,
    crossed2x: boolean,
    known30Entered: boolean,
  ): Promise<void> {
    const id = `${carId}:forecast`;
    const flag = crossed2x || known30Entered ? 'watch' : 'ok';
    const prev = this.db.healthNotificationState().find((n) => n.id === id);
    if (!prev) {
      await this.db.saveHealthNotificationState({
        id,
        carId,
        partDefinitionId: '__forecast__',
        lastForecastFlag: flag,
        baselinedAt: new Date().toISOString(),
      });
      return;
    }
    const rising = flag === 'watch' && prev.lastForecastFlag !== 'watch';
    await this.db.saveHealthNotificationState({
      id,
      carId,
      partDefinitionId: '__forecast__',
      lastForecastFlag: flag,
    });
    if (rising) {
      this.notify.showGeneric(
        this.i18n.t('notify.forecast.title' as MsgKey),
        this.i18n.t('notify.forecast.body' as MsgKey),
        'forecast',
      );
    }
  }
}
