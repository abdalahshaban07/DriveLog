import { tankEconomyVsAvg } from './economy';
import { fuelDashboardMetrics } from './fuel-dashboard';
import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';

export const FUEL_TIP_KEYS = [
  'fuel.tip.fullTank',
  'fuel.tip.tirePressure',
  'fuel.tip.noIdle',
  'fuel.tip.compareGrades',
] as const satisfies readonly MsgKey[];

export function pickFuelTipKey(seed = Date.now()): MsgKey {
  const i = Math.abs(seed) % FUEL_TIP_KEYS.length;
  return FUEL_TIP_KEYS[i]!;
}

export function nextFuelTipKey(currentKey: MsgKey, db: Db): MsgKey {
  const pool: MsgKey[] = [...FUEL_TIP_KEYS];
  const contextual = contextualFuelTipKey(db);
  if (!pool.includes(contextual)) {
    pool.push(contextual);
  }
  const candidates = pool.filter((k) => k !== currentKey);
  if (candidates.length === 0) {
    return currentKey;
  }
  const idx = Math.abs(Date.now()) % candidates.length;
  return candidates[idx]!;
}

export function contextualFuelTipKey(db: Db): MsgKey {
  const car = db.car();
  if (!car) {
    return FUEL_TIP_KEYS[0]!;
  }
  const vsAvg = tankEconomyVsAvg(db.fillUps());
  if (vsAvg?.direction === 'worse') {
    return 'fuel.tip.worseThanUsual';
  }
  if (vsAvg?.direction === 'better') {
    return 'fuel.tip.betterThanUsual';
  }
  const fuel = fuelDashboardMetrics(db.fillUps());
  if (fuel.lastL100 != null && fuel.lastL100 > 10) {
    return 'fuel.tip.highConsumption';
  }
  if (db.fillUps().length < 2) {
    return 'fuel.tip.logMore';
  }
  return pickFuelTipKey(car.currentOdometer);
}
