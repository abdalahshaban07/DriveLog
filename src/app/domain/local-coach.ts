import { activePeriod, periodTotals } from './expense-period';
import { fuelDashboardMetrics } from './fuel-dashboard';
import { askLocal } from './smart-advisor';
import { buildVehicleFacts } from './vehicle-facts';
import type { AdvisorIntent } from './advisor-intent';
import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';

export type CoachSource = 'local' | 'remote';

export type CoachReply = {
  text: string;
  source: CoachSource;
};

export function fetchCoachReply(
  db: Db,
  question: string,
  _lang: 'en' | 'ar',
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
  intentHint?: AdvisorIntent,
): CoachReply {
  const car = db.car();
  const facts = buildVehicleFacts(db);
  if (!car || !facts) {
    return { text: t('assistant.local.noCar'), source: 'local' };
  }
  const period = activePeriod(db.expensePeriods(), car.id);
  const totals = periodTotals(
    period,
    db.fillUps(),
    db.maintenance(),
    db.breakdowns(),
    db.otherExpenses(),
  );
  const fuel = fuelDashboardMetrics(db.fillUps());
  const answer = askLocal(
    question,
    facts,
    {
      currency: db.settings().currency,
      periodTotal: totals.total,
      maintenanceCount: db.maintenance().length,
      breakdownCount: db.breakdowns().length,
      lastL100: fuel.lastL100,
    },
    t,
    intentHint,
  );
  const text = `${t(answer.titleKey)} ${t(answer.bodyKey, answer.params)}`.trim();
  return { text, source: 'local' };
}
