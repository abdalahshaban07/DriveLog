import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Db } from '../data/db';
import { I18n } from '../i18n/i18n';
import { DueReminder } from './due-reminder';
import { Notify } from './notify';

function setup(opts: { shown: boolean; settings?: Record<string, unknown> }) {
  const notifyDue = vi.fn(async () => opts.shown);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: Db,
        useValue: {
          settings: () => ({ remindersEnabled: true, ...opts.settings }),
          car: () => ({ id: 'c1', currentOdometer: 1000, licenseExpiry: '2000-01-01' }),
          maintenance: () => [],
        },
      },
      { provide: Notify, useValue: { permission: () => 'granted', notifyDue } },
      { provide: I18n, useValue: { t: (k: string) => k } },
    ],
  });
  return { reminder: TestBed.inject(DueReminder), notifyDue };
}

describe('DueReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('tells about an overdue license once, not on every open', async () => {
    const { reminder, notifyDue } = setup({ shown: true });
    await reminder.check();
    await reminder.check();
    expect(notifyDue).toHaveBeenCalledTimes(1);
  });

  it('retries on the next open when the notification did not reach the user', async () => {
    const { reminder, notifyDue } = setup({ shown: false });
    await reminder.check();
    await reminder.check();
    expect(notifyDue).toHaveBeenCalledTimes(2);
  });

  it('stays silent when reminders are off', async () => {
    const { reminder, notifyDue } = setup({ shown: true, settings: { remindersEnabled: false } });
    await reminder.check();
    expect(notifyDue).not.toHaveBeenCalled();
  });
});
