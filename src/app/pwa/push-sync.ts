import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Db } from '../data/db';
import { buildDueItems, todayDateOnly } from '../domain/dues';
import { buildPushReminders, type PushDue } from '../domain/push-schedule';
import type { MsgKey } from '../i18n/en';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';
import { PUSH_CONFIG, pushConfigured } from './push-config';

const ID_KEY = 'drivelog.push.deviceId';
const ON_KEY = 'drivelog.push.on';
const HASH_KEY = 'drivelog.push.hash';

function store(key: string, value: string | null): void {
  try {
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    /* storage blocked */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function docUrl(id: string, mask?: readonly string[]): string {
  const base =
    `https://firestore.googleapis.com/v1/projects/${PUSH_CONFIG.firebaseProjectId}` +
    `/databases/(default)/documents/devices/${id}`;
  const params = new URLSearchParams({ key: PUSH_CONFIG.firebaseApiKey });
  for (const field of mask ?? []) {
    params.append('updateMask.fieldPaths', field);
  }
  return `${base}?${params.toString()}`;
}

/**
 * Keeps this phone's push subscription and its dated reminders in the user's own
 * Firestore, so a scheduled GitHub Actions job can send them when the app is closed.
 * Stores no name, VIN or plate: a random device id, the push endpoint, the time zone,
 * and "label + date" per reminder.
 */
@Injectable({ providedIn: 'root' })
export class PushSync {
  private readonly db = inject(Db);
  private readonly i18n = inject(I18n);
  private readonly notify = inject(Notify);
  private readonly sw = inject(SwPush);

  /** The feature exists in this build and the browser can do it. */
  available(): boolean {
    return (
      pushConfigured() &&
      this.sw.isEnabled &&
      typeof navigator !== 'undefined' &&
      'PushManager' in window &&
      this.notify.supported()
    );
  }

  isOn(): boolean {
    return read(ON_KEY) === '1';
  }

  /** Ask permission, subscribe, and upload. Returns whether background reminders are on. */
  async enable(): Promise<boolean> {
    if (!this.available()) {
      return false;
    }
    if (this.notify.permission() !== 'granted') {
      await this.notify.requestPermission();
    }
    if (this.notify.permission() !== 'granted') {
      return false;
    }
    try {
      await this.sw.requestSubscription({ serverPublicKey: PUSH_CONFIG.vapidPublicKey });
    } catch {
      return false;
    }
    if (!read(ID_KEY)) {
      store(ID_KEY, newDeviceId());
    }
    store(ON_KEY, '1');
    store(HASH_KEY, null);
    const ok = await this.sync();
    if (!ok) {
      store(ON_KEY, null);
    }
    return ok;
  }

  async disable(): Promise<void> {
    const id = read(ID_KEY);
    store(ON_KEY, null);
    store(HASH_KEY, null);
    try {
      const sub = await firstValueFrom(this.sw.subscription);
      await sub?.unsubscribe();
    } catch {
      /* already gone */
    }
    if (id && pushConfigured()) {
      try {
        await fetch(docUrl(id), { method: 'DELETE' });
      } catch {
        /* offline: the server drops dead endpoints on its own */
      }
    }
    store(ID_KEY, null);
  }

  /** Upload the current reminders. Silent no-op when off, offline or unchanged. */
  async sync(): Promise<boolean> {
    if (!this.isOn() || !this.available()) {
      return false;
    }
    const id = read(ID_KEY);
    if (!id) {
      return false;
    }
    const settings = this.db.settings();
    if (settings.remindersEnabled !== true || this.notify.permission() !== 'granted') {
      await this.disable();
      return false;
    }
    const car = this.db.car();
    if (!car) {
      return false;
    }
    let sub: PushSubscription | null;
    try {
      sub = await firstValueFrom(this.sw.subscription);
    } catch {
      return false;
    }
    if (!sub) {
      return false;
    }

    const dues: PushDue[] = buildDueItems(
      settings,
      this.db.maintenance(),
      car.currentOdometer,
      todayDateOnly(),
      car,
    )
      .filter((d) => d.dueDate && (d.source !== 'maintenance' || settings.notifyMaintenance !== false))
      .map((d) => ({
        id: d.id,
        dueDate: d.dueDate!,
        label: this.i18n.t(d.labelKey as MsgKey, d.labelParams),
      }));
    const reminders = buildPushReminders(dues, {
      soon: this.i18n.t('notify.due.soonTitle' as MsgKey),
      overdue: this.i18n.t('notify.due.overdueTitle' as MsgKey),
    });
    const fields = {
      sub: JSON.stringify(sub.toJSON()),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      lang: this.i18n.language(),
      reminders: JSON.stringify(reminders),
    };
    const hash = JSON.stringify(fields);
    if (read(HASH_KEY) === hash) {
      return true;
    }
    try {
      const res = await fetch(docUrl(id, ['sub', 'tz', 'lang', 'reminders', 'updatedAt']), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fields: {
            sub: { stringValue: fields.sub },
            tz: { stringValue: fields.tz },
            lang: { stringValue: fields.lang },
            reminders: { stringValue: fields.reminders },
            updatedAt: { stringValue: new Date().toISOString() },
          },
        }),
      });
      if (!res.ok) {
        return false;
      }
      store(HASH_KEY, hash);
      return true;
    } catch {
      return false;
    }
  }
}
