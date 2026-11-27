import { Injectable, inject } from '@angular/core';
import { Db } from '../data/db';
import { buildDueItems, todayDateOnly } from '../domain/dues';
import type { MsgKey } from '../i18n/en';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';

const KEY_PREFIX = 'drivelog.dueNotify.';
/** Never flood a phone on the first run after an update or a long absence. */
const MAX_PER_RUN = 3;

/**
 * Notifies once when a license, registration or maintenance due becomes due soon,
 * and once more when it goes overdue. Only marks an item as told after the
 * notification actually reached the user, so a failed attempt is retried next open.
 */
@Injectable({ providedIn: 'root' })
export class DueReminder {
  private readonly db = inject(Db);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(I18n);

  async check(): Promise<void> {
    const settings = this.db.settings();
    if (settings.remindersEnabled !== true || this.notify.permission() !== 'granted') {
      return;
    }
    const car = this.db.car();
    if (!car) {
      return;
    }
    const items = buildDueItems(
      settings,
      this.db.maintenance(),
      car.currentOdometer,
      todayDateOnly(),
      car,
    ).filter((d) => d.status === 'overdue' || d.status === 'dueSoon');

    let sent = 0;
    for (const item of items) {
      if (sent >= MAX_PER_RUN) {
        break;
      }
      if (item.source === 'maintenance' && settings.notifyMaintenance === false) {
        continue;
      }
      const key = `${KEY_PREFIX}${item.id}.${item.status}`;
      const stamp = `${item.dueDate ?? ''}|${item.dueKm ?? ''}`;
      try {
        if (localStorage.getItem(key) === stamp) {
          continue;
        }
      } catch {
        /* storage blocked: fall through and notify */
      }
      const label = this.i18n.t(item.labelKey as MsgKey, item.labelParams);
      const title = this.i18n.t(
        (item.status === 'overdue' ? 'notify.due.overdueTitle' : 'notify.due.soonTitle') as MsgKey,
      );
      const body = this.i18n.t('notify.due.body' as MsgKey, { label });
      if (await this.notify.notifyDue(item, title, body)) {
        sent += 1;
        try {
          localStorage.setItem(key, stamp);
        } catch {
          /* ignore quota */
        }
      }
    }
  }
}
