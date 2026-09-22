import type { PreTripCheck, PreTripItemId } from './models';
import { PRE_TRIP_ITEM_IDS } from './models';

export type PreTripItemDef = {
  id: PreTripItemId;
  labelKey: `preTrip.item.${PreTripItemId}`;
};

export const PRE_TRIP_ITEMS: readonly PreTripItemDef[] = PRE_TRIP_ITEM_IDS.map((id) => ({
  id,
  labelKey: `preTrip.item.${id}` as PreTripItemDef['labelKey'],
}));

export function emptyPreTripItems(): Record<PreTripItemId, boolean> {
  return {
    tires: false,
    lights: false,
    fluids: false,
    brakes: false,
    docs: false,
    spare: false,
  };
}

export function allPreTripChecked(items: Record<PreTripItemId, boolean>): boolean {
  return PRE_TRIP_ITEM_IDS.every((id) => items[id]);
}

export function latestPreTripForCar(
  checks: readonly PreTripCheck[],
  carId: string,
): PreTripCheck | null {
  const list = checks.filter((c) => c.carId === carId);
  if (!list.length) {
    return null;
  }
  return [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )[0]!;
}
