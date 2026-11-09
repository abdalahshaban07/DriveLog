import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEEP,
  BACKUP_PREFIX,
  backupFileName,
  isWeeklyDue,
  pruneBackupNames,
} from './backup-schedule';

const NOW = new Date('2026-11-08T12:00:00.000Z');

describe('isWeeklyDue', () => {
  it('is due when never backed up', () => {
    expect(isWeeklyDue(null, NOW)).toBe(true);
    expect(isWeeklyDue(undefined, NOW)).toBe(true);
    expect(isWeeklyDue('', NOW)).toBe(true);
  });

  it('is due when the timestamp is unparseable', () => {
    expect(isWeeklyDue('not-a-date', NOW)).toBe(true);
  });

  it('is not due within the week', () => {
    expect(isWeeklyDue('2026-11-02T12:00:00.000Z', NOW)).toBe(false);
    expect(isWeeklyDue('2026-11-07T12:00:00.000Z', NOW)).toBe(false);
  });

  it('is due exactly seven days later', () => {
    expect(isWeeklyDue('2026-11-01T12:00:00.000Z', NOW)).toBe(true);
    expect(isWeeklyDue('2026-10-01T12:00:00.000Z', NOW)).toBe(true);
  });
});

describe('backupFileName', () => {
  it('names a plain backup by UTC day', () => {
    expect(backupFileName(NOW, false)).toBe('drivelog-backup-2026-11-08.json');
  });

  it('marks encrypted backups with a distinct extension', () => {
    expect(backupFileName(NOW, true)).toBe('drivelog-backup-2026-11-08.json.enc');
  });
});

describe('pruneBackupNames', () => {
  const names = [
    `${BACKUP_PREFIX}2026-10-01.json`,
    `${BACKUP_PREFIX}2026-10-08.json`,
    `${BACKUP_PREFIX}2026-10-15.json`,
    `${BACKUP_PREFIX}2026-10-22.json`,
    `${BACKUP_PREFIX}2026-10-29.json`,
    `${BACKUP_PREFIX}2026-11-05.json.enc`,
  ];

  it('keeps the newest four and returns the rest for deletion', () => {
    const doomed = pruneBackupNames(names);
    expect(doomed).toEqual([
      `${BACKUP_PREFIX}2026-10-08.json`,
      `${BACKUP_PREFIX}2026-10-01.json`,
    ]);
    expect(names.length - doomed.length).toBe(BACKUP_KEEP);
  });

  it('ignores unrelated files', () => {
    expect(pruneBackupNames(['notes.txt', 'photo.png', ...names])).toEqual([
      `${BACKUP_PREFIX}2026-10-08.json`,
      `${BACKUP_PREFIX}2026-10-01.json`,
    ]);
  });

  it('returns nothing when at or under the keep count', () => {
    expect(pruneBackupNames(names.slice(0, 4))).toEqual([]);
    expect(pruneBackupNames([])).toEqual([]);
  });

  it('honors a custom keep count', () => {
    expect(pruneBackupNames(names, 2)).toHaveLength(4);
  });
});