import type { ChargeSession } from './models';

/** kWh per 100 km when distance is known. */
export function kWhPer100Km(session: Pick<ChargeSession, 'kWh' | 'distanceKm'>): number | null {
  const d = session.distanceKm;
  if (d == null || !(d > 0) || !(session.kWh > 0)) {
    return null;
  }
  return (session.kWh / d) * 100;
}
