import { knownOdometer, latestEconomy, overallLitersPer100Km } from './economy';
import type { FillUp } from './models';

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

/** Runnable self-check for core economy rules. */
export function runEconomySelfCheck(): void {
  const base = (
    partial: Partial<FillUp> &
      Pick<FillUp, 'id' | 'odometer' | 'liters' | 'cost' | 'tankFull'>,
  ): FillUp => ({
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  });

  const fillUps: FillUp[] = [
    base({ id: 'a', odometer: 10000, liters: 50, cost: 70, tankFull: true }),
    base({ id: 'b', odometer: 10250, liters: 20, cost: 30, tankFull: false }),
    base({ id: 'c', odometer: 10500, liters: 45, cost: 65, tankFull: true }),
  ];

  // Distance comes from odometer gaps only; every fill is its own point.
  const latest = latestEconomy(fillUps);
  assert(!!latest, 'expected a segment');
  assert(latest!.distanceKm === 250, `distance ${latest!.distanceKm}`);
  assert(latest!.litersPer100Km === 18, `L/100km ${latest!.litersPer100Km}`);
  assert(latest!.totalCost === 65, `totalCost ${latest!.totalCost}`);
  assert(latest!.costPerKm === 0.26, `cost/km ${latest!.costPerKm}`);

  assert(latestEconomy([fillUps[0]!]) === null, 'one fill, no distance → null');
  assert(latestEconomy([]) === null, 'empty → null');
  // 20 L over 250 km and 45 L over 250 km: 65 L over 500 km.
  assert(overallLitersPer100Km(fillUps) === 13, `overall ${overallLitersPer100Km(fillUps)}`);

  const twoSeg = [
    ...fillUps,
    base({ id: 'd', odometer: 10900, liters: 40, cost: 50, tankFull: true }),
  ];
  const overall = overallLitersPer100Km(twoSeg);
  assert(overall === (105 / 900) * 100, `overall ${overall}`);
  const last = latestEconomy(twoSeg);
  assert(last!.litersPer100Km === 10, `latest ${last!.litersPer100Km}`);

  // Equal odometers: distance 0 → skipped
  const equal = latestEconomy([
    base({ id: 'x', odometer: 200, liters: 10, cost: 10, tankFull: true }),
    base({ id: 'y', odometer: 200, liters: 10, cost: 10, tankFull: true }),
  ]);
  assert(equal === null, 'zero distance skipped');

  assert(knownOdometer(100, fillUps, []) === 10500, 'known odo');
}
