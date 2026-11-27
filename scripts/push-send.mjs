#!/usr/bin/env node
/**
 * Sends due DriveLog reminders as Web Push. Runs on a GitHub Actions schedule.
 * Reads devices from the user's own Firestore, sends with web-push, and records what
 * was delivered so nothing is sent twice. Deletes devices whose subscription expired.
 *
 * Env: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT (JSON), VAPID_PUBLIC_KEY,
 *      VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL).
 * Test hooks: FIRESTORE_BASE, ACCESS_TOKEN, DRY_RUN=1.
 * Node 22.18+ runs the shared TypeScript file directly.
 */
import { createSign } from 'node:crypto';
import { parseDevice, planDevice } from '../src/app/domain/push-schedule.ts';

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? '';
const BASE = process.env.FIRESTORE_BASE ?? 'https://firestore.googleapis.com';
const DRY = process.env.DRY_RUN === '1';
const root = `${BASE}/v1/projects/${PROJECT}/databases/(default)/documents/devices`;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

async function accessToken() {
  if (process.env.ACCESS_TOKEN) {
    return process.env.ACCESS_TOKEN;
  }
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3000,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(account.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status}`);
  }
  return (await res.json()).access_token;
}

async function listDevices(token) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${root}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`list failed: ${res.status}`);
    }
    const body = await res.json();
    for (const doc of body.documents ?? []) {
      out.push({ id: doc.name.split('/').pop(), fields: doc.fields ?? {} });
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

const str = (f) => f?.stringValue;

export async function main({ now = process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : new Date(), sender } = {}) {
  const token = await accessToken();
  let send = sender;
  if (!send) {
    // ESM imports ignore NODE_PATH, so resolve from it explicitly (the workflow installs web-push outside the app project).
    const { createRequire } = await import('node:module');
    const base = process.env.NODE_PATH ? process.env.NODE_PATH.split(':')[0] + '/' : process.cwd() + '/';
    const mod = createRequire(base).resolve ? createRequire(base)('web-push') : await import('web-push');
    const webpush = mod.default ?? mod;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    send = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 86_400, urgency: 'normal' });
  }
  const summary = { devices: 0, sent: 0, failed: 0, removed: 0 };
  for (const { id, fields } of await listDevices(token)) {
    summary.devices += 1;
    let sub;
    try {
      sub = JSON.parse(str(fields.sub) ?? '');
    } catch {
      continue;
    }
    const device = parseDevice({ tz: str(fields.tz), reminders: str(fields.reminders), sent: str(fields.sent) });
    if (process.env.TEST_PUSH === '2') {
      if (!id.startsWith(process.env.ONLY_DEVICE ?? '#')) { continue; }
      let list = [];
      try { list = JSON.parse(str(fields.reminders) ?? '[]'); } catch {}
      list.sort((a, b) => a.fireOn.localeCompare(b.fireOn));
      console.log(`today=${now.toISOString().slice(0, 10)} tz=${str(fields.tz)} count=${list.length}`);
      for (const r of list) {
        console.log(`R ${r.id.startsWith('maint-') ? 'maint' : r.id.split('.')[0]} ${r.id.split('.')[1]} fire=${r.fireOn} expire=${r.expireOn}`);
      }
      const pick = list.find((r) => r.id.startsWith('maint-') && r.id.includes('.soon.')) ?? list[0];
      if (pick) {
        try {
          await send(sub, JSON.stringify({ notification: { title: pick.title, body: pick.body, tag: 'sample-' + pick.id, icon: 'icons/icon-192.png' } }));
          console.log(`sample sent kind=${pick.id.split('.')[0].slice(0, 5)}`);
          summary.sent += 1;
        } catch (err) { console.log(`sample failed status=${err?.statusCode}`); }
      }
      continue;
    }
    if (process.env.TEST_PUSH === '1') {
      let host = '?';
      try { host = new URL(sub.endpoint).host; } catch {}
      let count = '?';
      try { count = JSON.parse(str(fields.reminders) ?? '[]').length; } catch {}
      console.log(`test device ${id.slice(0, 6)} host=${host} updatedAt=${str(fields.updatedAt)} reminders=${count}`);
      try {
        await send(sub, JSON.stringify({ notification: { title: 'تجربة تنبيه DriveLog', body: 'لو شايف الرسالة دي يبقى التنبيهات شغالة والتطبيق مقفول', tag: 'drivelog-test', icon: 'icons/icon-192.png' } }));
        summary.sent += 1;
        console.log(`test sent ${id.slice(0, 6)}`);
      } catch (err) {
        console.log(`test failed ${id.slice(0, 6)} status=${err?.statusCode}`);
        summary.failed += 1;
      }
      continue;
    }
    const plan = planDevice(device, now);
    if (!plan.toSend.length) {
      continue;
    }
    const delivered = new Set();
    let gone = false;
    for (const reminder of plan.toSend) {
      if (DRY) {
        console.log(`dry-run: would send "${reminder.title}" (${reminder.id}) to ${id.slice(0, 6)}`);
        continue;
      }
      const payload = JSON.stringify({
        notification: {
          title: reminder.title,
          body: reminder.body,
          tag: reminder.id,
          icon: 'icons/icon-192.png',
          data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: './' } } },
        },
      });
      try {
        await send(sub, payload);
        delivered.add(reminder.id);
        summary.sent += 1;
      } catch (err) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          gone = true;
          break;
        }
        summary.failed += 1;
      }
    }
    if (DRY) {
      continue;
    }
    const auth = { authorization: `Bearer ${token}` };
    if (gone) {
      await fetch(`${root}/${id}`, { method: 'DELETE', headers: auth });
      summary.removed += 1;
      continue;
    }
    if (delivered.size) {
      const sent = JSON.stringify(plan.sentAfter(delivered));
      const res = await fetch(`${root}/${id}?updateMask.fieldPaths=sent`, {
        method: 'PATCH',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { sent: { stringValue: sent } } }),
      });
      if (!res.ok) {
        throw new Error(`could not record sent marks for ${id.slice(0, 6)}: ${res.status}`);
      }
    }
  }
  console.log(JSON.stringify(summary));
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
