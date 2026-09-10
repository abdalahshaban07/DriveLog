import { Injectable, inject } from '@angular/core';
import { Db } from '../data/db';
import { publicHolidays } from '../data/remote';
import { countryFromCurrency } from '../domain/country';
import { buildDueItems, todayDateOnly } from '../domain/dues';
import { dueHolidayNudge } from '../domain/holidays';
import type { MsgKey } from '../i18n/en';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';

const DEDUPE_PREFIX = 'drivelog.holidayNotify.';

/** Once-per-day browser notify when a due overlaps an upcoming public holiday. */
@Injectable({ providedIn: 'root' })
export class HolidayReminder {
  private readonly db = inject(Db);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(I18n);

  async check(): Promise<void> {
    if (this.db.settings().remindersEnabled !== true) {
      return;
    }
    if (this.notify.permission() !== 'granted') {
      return;
    }
    const car = this.db.car();
    if (!car) {
      return;
    }
    const today = todayDateOnly();
    const cc = countryFromCurrency(this.db.settings().currency);
    const year = Number(today.slice(0, 4));
    const holidays = await publicHolidays(cc, year);
    if (!holidays.length) {
      return;
    }
    const dues = buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
      today,
      car,
    ).filter((d) => d.status === 'overdue' || d.status === 'dueSoon');

    const title = this.i18n.t('notify.holiday.title' as MsgKey);
    for (const item of dues) {
      const holiday = dueHolidayNudge(item.dueDate, holidays, today);
      if (!holiday) {
        continue;
      }
      const key = `${DEDUPE_PREFIX}${item.id}.${holiday.date}`;
      try {
        if (localStorage.getItem(key) === today) {
          continue;
        }
        localStorage.setItem(key, today);
      } catch {
        /* ignore quota */
      }
      const body = this.i18n.t('notify.holiday.body' as MsgKey, {
        name: holiday.localName,
        date: holiday.date,
      });
      await this.notify.notifyDue(item, title, body);
    }
  }
}
