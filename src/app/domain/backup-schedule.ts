/** Weekly auto-backup cadence, file naming, and retention (pure, clock-injected). */

export const BACKUP_INTERVAL_DAYS = 7;
export const BACKUP_KEEP = 4;
export const BACKUP_PREFIX = 'drivelog-backup-';

const DAY_MS = 86_400_000;

/** True when never done, the timestamp is bad, or a full week has elapsed. */
export function isWeeklyDue(lastAt: string | null | undefined, now: Date): boolean {
  if (!lastAt) {
    return true;
  }
  const last = Date.parse(lastAt);
  if (!Number.isFinite(last)) {
    return true;
  }
  return now.getTime() - last >= BACKUP_INTERVAL_DAYS * DAY_MS;
}

/** One dated file per day; encrypted backups carry a distinct extension. */
export function backupFileName(now: Date, encrypted: boolean): string {
  const day = now.toISOString().slice(0, 10);
  return `${BACKUP_PREFIX}${day}${encrypted ? '.json.enc' : '.json'}`;
}

/** Dated backup names to delete so only the newest `keep` remain. */
export function pruneBackupNames(names: readonly string[], keep = BACKUP_KEEP): string[] {
  const dated = names
    .filter((n) => n.startsWith(BACKUP_PREFIX))
    .map((n) => ({
      n,
      t: Date.parse(n.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10)),
    }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => b.t - a.t);
  return dated.slice(Math.max(0, keep)).map((x) => x.n);
}