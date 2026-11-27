import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  buildPushReminders,
  pruneSent,
  PUSH_MAX_PER_RUN,
  selectToSend,
  todayInTimeZone,
} from './push-schedule';

const titles = { soon: 'soon', overdue: 'overdue' };
const rem = buildPushReminders([{ id: 'license', dueDate: '2026-12-10', label: 'License' }], titles);

describe('push schedule', () => {
  it('adds days across month and year ends', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('sends nothing before the due-soon window', () => {
    expect(selectToSend(rem, new Set(), '2026-11-25')).toEqual([]);
  });

  it('sends "soon" on day 14 before, once', () => {
    const first = selectToSend(rem, new Set(), '2026-11-26');
    expect(first.map((r) => r.id)).toEqual(['license.soon.2026-12-10']);
    expect(selectToSend(rem, new Set([first[0]!.id]), '2026-11-27')).toEqual([]);
  });

  it('a late job still sends "soon" inside the window (nothing missed)', () => {
    expect(selectToSend(rem, new Set(), '2026-12-09').map((r) => r.id)).toEqual([
      'license.soon.2026-12-10',
    ]);
  });

  it('sends "overdue" on the due day and still up to 7 days late, then drops it', () => {
    const sent = new Set(['license.soon.2026-12-10']);
    expect(selectToSend(rem, sent, '2026-12-10').map((r) => r.id)).toEqual([
      'license.overdue.2026-12-10',
    ]);
    expect(selectToSend(rem, sent, '2026-12-17')).toHaveLength(1);
    expect(selectToSend(rem, sent, '2026-12-18')).toEqual([]);
  });

  it('never sends the soon reminder once the item is overdue', () => {
    expect(selectToSend(rem, new Set(), '2026-12-10').map((r) => r.id)).toEqual([
      'license.overdue.2026-12-10',
    ]);
  });

  it('a new due date is a new reminder even for the same item', () => {
    const renewed = buildPushReminders(
      [{ id: 'license', dueDate: '2027-12-10', label: 'License' }],
      titles,
    );
    expect(renewed[0]!.id).not.toBe(rem[0]!.id);
  });

  it('caps one run and sends the rest on the next', () => {
    const many = buildPushReminders(
      ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, dueDate: '2026-12-01', label: id })),
      titles,
    );
    const run1 = selectToSend(many, new Set(), '2026-12-01');
    expect(run1).toHaveLength(PUSH_MAX_PER_RUN);
    const run2 = selectToSend(many, new Set(run1.map((r) => r.id)), '2026-12-01');
    expect(run2.length).toBeGreaterThan(0);
    expect(new Set([...run1, ...run2].map((r) => r.id)).size).toBe(run1.length + run2.length);
  });

  it('ignores bad dates', () => {
    expect(buildPushReminders([{ id: 'x', dueDate: 'soon', label: 'x' }], titles)).toEqual([]);
  });

  it('reads the calendar day in the phone timezone', () => {
    const now = new Date('2026-12-09T22:30:00Z');
    expect(todayInTimeZone('Africa/Cairo', now)).toBe('2026-12-10');
    expect(todayInTimeZone('UTC', now)).toBe('2026-12-09');
    expect(todayInTimeZone('Not/AZone', now)).toBe('2026-12-09');
  });

  it('prunes sent marks of reminders that no longer exist', () => {
    expect(pruneSent(['license.soon.2026-12-10', 'gone.soon.2025-01-01'], rem)).toEqual([
      'license.soon.2026-12-10',
    ]);
  });
});
