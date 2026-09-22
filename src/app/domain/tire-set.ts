import type { Car, DateOnly, Maintenance } from './models';

/** Legal-ish soft threshold for passenger tread (mm). */
export const LOW_TREAD_MM = 3;

/** Soft nudge after this many days on one set. */
export const TIRE_SWAP_DAYS = 180;

export type TireReminder = {
  id: 'tire-swap' | 'tire-tread';
  titleKey: 'rec.tire.swap.title' | 'rec.tire.tread.title';
  bodyKey: 'rec.tire.swap.body' | 'rec.tire.tread.body';
  bodyParams?: Record<string, string | number>;
};

function daysBetween(from: DateOnly, to: DateOnly): number {
  const a = Date.parse(`${from}T12:00:00`);
  const b = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  return Math.floor((b - a) / 86_400_000);
}

export function latestTireTreadMm(maintenance: readonly Maintenance[]): number | null {
  let best: { odo: number; value: number; date: string } | null = null;
  for (const m of maintenance) {
    for (const meas of m.measurements ?? []) {
      if (meas.type !== 'tireTreadMm' || !Number.isFinite(meas.value)) {
        continue;
      }
      const cand = { odo: m.odometer, value: meas.value, date: m.date };
      if (
        !best ||
        cand.date > best.date ||
        (cand.date === best.date && cand.odo >= best.odo)
      ) {
        best = cand;
      }
    }
  }
  return best?.value ?? null;
}

/** Swap / low-tread reminders for Home coach. */
export function tireReminders(
  car: Car,
  maintenance: readonly Maintenance[],
  today: DateOnly,
): TireReminder[] {
  const out: TireReminder[] = [];
  const swapped = car.tireSetSwappedAt;
  if (swapped && daysBetween(swapped, today) >= TIRE_SWAP_DAYS) {
    out.push({
      id: 'tire-swap',
      titleKey: 'rec.tire.swap.title',
      bodyKey: 'rec.tire.swap.body',
      bodyParams: { set: car.activeTireSet ?? 'A' },
    });
  }
  const tread = latestTireTreadMm(maintenance);
  if (tread != null && tread <= LOW_TREAD_MM) {
    out.push({
      id: 'tire-tread',
      titleKey: 'rec.tire.tread.title',
      bodyKey: 'rec.tire.tread.body',
      bodyParams: { mm: tread },
    });
  }
  return out;
}
