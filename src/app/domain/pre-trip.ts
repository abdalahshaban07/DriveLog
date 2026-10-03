import type { PreTripItemId } from './models';
import { PRE_TRIP_ITEM_IDS } from './models';

export type PreTripItemDef = {
  id: PreTripItemId;
  labelKey: `preTrip.item.${PreTripItemId}`;
  hintKey: `preTrip.hint.${PreTripItemId}`;
};

export const PRE_TRIP_ITEMS: readonly PreTripItemDef[] = PRE_TRIP_ITEM_IDS.map((id) => ({
  id,
  labelKey: `preTrip.item.${id}` as PreTripItemDef['labelKey'],
  hintKey: `preTrip.hint.${id}` as PreTripItemDef['hintKey'],
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

export function countPreTripChecked(items: Record<PreTripItemId, boolean>): number {
  return PRE_TRIP_ITEM_IDS.reduce((n, id) => n + (items[id] ? 1 : 0), 0);
}

export function allPreTripChecked(items: Record<PreTripItemId, boolean>): boolean {
  return countPreTripChecked(items) === PRE_TRIP_ITEM_IDS.length;
}
